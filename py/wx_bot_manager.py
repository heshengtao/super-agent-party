from concurrent.futures import ThreadPoolExecutor
import os
import pythoncom  # 导入 pywin32 的 pythoncom 模块
import re
import threading
import weakref
import logging
from typing import List, Optional
from pydantic import BaseModel
from wxauto import WeChat
from wxauto.msgs import FriendMessage
import time
import requests
import tempfile
import base64
import pyperclip
import asyncio
from openai import AsyncOpenAI
from py.get_setting import get_port,UPLOAD_FILES_DIR,load_settings
class WXBotManager:
    def __init__(self):
        self.bot_thread: Optional[threading.Thread] = None
        self.bot_client: Optional[WXClient] = None
        self.is_running = False
        self.config = None
        self.loop = None
        self._shutdown_event = threading.Event()
        self._startup_complete = threading.Event()
        self._ready_complete = threading.Event()
        self._startup_error = None

    def start_bot(self, config):
        if self.is_running:
            raise Exception("机器人已在运行")

        self.config = config
        self._shutdown_event.clear()
        self._startup_complete.clear()
        self._ready_complete.clear()
        self._startup_error = None

        self.bot_thread = threading.Thread(
            target=self._run_bot_thread,
            args=(config,),
            daemon=True,
            name="WXBotThread"
        )
        self.bot_thread.start()

        if not self._startup_complete.wait(timeout=30):
            self.stop_bot()
            raise Exception("机器人连接超时")

        if self._startup_error:
            self.stop_bot()
            raise Exception(f"机器人启动失败: {self._startup_error}")

        if not self._ready_complete.wait(timeout=30):
            self.stop_bot()
            raise Exception("机器人就绪超时，请检查网络连接和配置")

        if not self.is_running:
            self.stop_bot()
            raise Exception("机器人未能正常运行")

    def _run_bot_thread(self, config):
        pythoncom.CoInitialize()  # 初始化 COM 库
        self.loop = None
        bot_task = None

        try:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

            self.bot_client = WXClient()
            self.bot_client.WXAgent = config.WXAgent
            self.bot_client.memoryLimit = config.memoryLimit
            self.bot_client.separators = config.separators if config.separators else ['。', '\n', '？', '！']
            self.bot_client.reasoningVisible = config.reasoningVisible
            self.bot_client.quickRestart = config.quickRestart
            self.bot_client.nickNameList = config.nickNameList
            self.bot_client.wakeWord = config.wakeWord

            self.bot_client._manager_ref = weakref.ref(self)
            self.bot_client._ready_callback = self._on_bot_ready

            async def run_bot():
                try:
                    logging.info("开始连接微信机器人...")
                    await self.bot_client.start()
                except asyncio.CancelledError:
                    logging.info("机器人任务被取消")
                except Exception as e:
                    logging.error(f"机器人运行时异常: {e}")
                    self._startup_error = str(e)
                    if not self._startup_complete.is_set():
                        self._startup_complete.set()
                    raise

            bot_task = self.loop.create_task(run_bot())

            def connection_established():
                if not self._startup_error:
                    self._startup_complete.set()
                    logging.info("机器人连接已建立，等待就绪...")

            async def delayed_connection_check():
                await asyncio.sleep(2)
                if not bot_task.done() and not self._startup_error:
                    connection_established()

            check_task = self.loop.create_task(delayed_connection_check())
            self.loop.run_until_complete(bot_task)

        except Exception as e:
            logging.error(f"机器人线程异常: {e}")
            if not self._startup_error:
                self._startup_error = str(e)
        finally:
            if not self._startup_complete.is_set():
                self._startup_complete.set()
            if not self._ready_complete.is_set():
                self._ready_complete.set()

            if bot_task and not bot_task.done():
                bot_task.cancel()
                try:
                    self.loop.run_until_complete(bot_task)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logging.warning(f"取消机器人任务时出错: {e}")

            self._cleanup()
            pythoncom.CoUninitialize()  # 释放 COM 库

    def _on_bot_ready(self):
        self.is_running = True
        self._ready_complete.set()
        logging.info("微信机器人已完全就绪")

    def _cleanup(self):
        self.is_running = False

        if self.bot_client and self.loop and not self.loop.is_closed():
            try:
                self.bot_client._shutdown_requested = True

                if hasattr(self.bot_client, 'close'):
                    async def close_client():
                        try:
                            await self.bot_client.close()
                        except Exception as e:
                            logging.warning(f"关闭客户端时出错: {e}")

                    close_task = self.loop.create_task(close_client())
                    try:
                        self.loop.run_until_complete(close_task)
                    except Exception as e:
                        logging.warning(f"执行关闭任务时出错: {e}")

            except Exception as e:
                logging.warning(f"清理机器人客户端时出错: {e}")

        if self.loop and not self.loop.is_closed():
            try:
                pending_tasks = []
                try:
                    pending_tasks = asyncio.all_tasks(self.loop)
                except RuntimeError:
                    pass

                for task in pending_tasks:
                    if not task.done():
                        task.cancel()

                if pending_tasks:
                    try:
                        async def cancel_all_tasks():
                            await asyncio.gather(*pending_tasks, return_exceptions=True)

                        cancel_task = self.loop.create_task(cancel_all_tasks())
                        self.loop.run_until_complete(cancel_task)

                    except Exception as e:
                        logging.warning(f"等待任务取消时出错: {e}")

                if not self.loop.is_closed():
                    self.loop.close()

            except Exception as e:
                logging.warning(f"关闭事件循环时出错: {e}")

        self.bot_client = None
        self.loop = None
        self._shutdown_event.set()

    def stop_bot(self):
        if not self.is_running and not self.bot_thread:
            return

        logging.info("正在停止微信机器人...")
        self._shutdown_event.set()
        self.is_running = False

        if self.bot_client:
            self.bot_client._shutdown_requested = True

        if self.loop and not self.loop.is_closed():
            try:
                self.loop.call_soon_threadsafe(self.loop.stop)
            except RuntimeError as e:
                logging.debug(f"事件循环已停止: {e}")
            except Exception as e:
                logging.warning(f"停止事件循环时出错: {e}")

        if self.bot_thread and self.bot_thread.is_alive():
            try:
                self.bot_thread.join(timeout=10)
                if self.bot_thread.is_alive():
                    logging.warning("机器人线程在超时后仍在运行")
            except Exception as e:
                logging.warning(f"等待线程结束时出错: {e}")

        logging.info("微信机器人已停止")

    def get_status(self):
        return {
            "is_running": self.is_running,
            "thread_alive": self.bot_thread.is_alive() if self.bot_thread else False,
            "client_ready": self.bot_client.is_running if self.bot_client else False,
            "config": self.config.model_dump() if self.config else None,
            "loop_running": self.loop and not self.loop.is_closed() if self.loop else False,
            "startup_error": self._startup_error,
            "connection_established": self._startup_complete.is_set(),
            "ready_completed": self._ready_complete.is_set()
        }

    def __del__(self):
        try:
            self.stop_bot()
        except:
            pass

class WXClient:
    def __init__(self):
        self.is_running = False
        self.WXAgent = "super-model"
        self.memoryLimit = 10
        self.memoryList = {}
        self.asyncToolsID = {}
        self.fileLinks = {}
        self.separators = ['。', '\n', '？', '！']
        self.reasoningVisible = False
        self.quickRestart = True
        self._ready_event = asyncio.Event()
        self._shutdown_requested = False
        self._manager_ref = None
        self._ready_callback = None
        self.nickNameList = []
        self.wakeWord = ""
        self.wx = WeChat()
        self.port = get_port()
        self.executor = ThreadPoolExecutor(max_workers=5)  # 用于处理异步任务
        self.client = AsyncOpenAI(
            api_key="super-secret-key",
            base_url=f"http://127.0.0.1:{self.port}/v1"
        )
        self.last_image_urls = {}


    async def start(self):
        self.is_running = True
        self._ready_event.set()
        if self._ready_callback:
            self._ready_callback()
        logging.info("微信机器人已就绪，可以接收消息")
        
        for nickname in self.nickNameList:
            self.wx.AddListenChat(nickname=nickname, callback=self.on_message)
        
        while not self._shutdown_requested:
            await asyncio.sleep(1)

    def on_message(self, msg, chat):
        """同步回调方法，将异步处理委托给线程池"""
        if isinstance(msg, FriendMessage):
            # 使用线程池执行异步处理
            self.executor.submit(self._run_async_message_handler, msg, chat)

    def _run_async_message_handler(self, msg, chat):
        """在线程池中运行异步消息处理"""
        try:
            # 创建新的事件循环来运行异步函数
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._handle_message_async(msg, chat))
        except Exception as e:
            logging.error(f"处理消息时出错: {e}")
        finally:
            loop.close()

    async def _handle_message_async(self, msg, chat):
        """异步处理消息的实际逻辑"""
        settings = await load_settings()
        c_id = msg.sender
        c_name = msg.sender
        chat_info = msg.chat_info()
        if 'chat_type' in chat_info:
            c_type = chat_info['chat_type']
        else:
            c_type = "friend"
        if c_type == "group":
            c_id = chat_info['chat_name']
        
        if c_id not in self.memoryList:
            self.memoryList[c_id] = []
        if c_id not in self.last_image_urls:
            self.last_image_urls[c_id] = []

        if self.quickRestart:
            if "/重启" in msg.content:
                self.memoryList[c_id] = []
                self.wx.SendMsg("对话记录已重置。", who=c_id)
                return
            if "/restart" in msg.content:
                self.memoryList[c_id] = []
                self.wx.SendMsg("The conversation record has been reset.", who=c_id)
                return
        
        if msg.type == "image":
            img_path=msg.download(dir_path=UPLOAD_FILES_DIR)
            image_name = img_path.name
            data_url = f"http://127.0.0.1:{self.port}/uploaded_files/{image_name}"
            self.last_image_urls[c_id].append(data_url)
            return
        elif msg.type == "text" or msg.type == "quote":
            if c_type == "group":
                if self.wakeWord:
                    if self.wakeWord not in msg.content:
                        return

            print(f"{msg.content}")
            if self.last_image_urls and self.last_image_urls[c_id]:
                user_content = []
                for url in self.last_image_urls[c_id]:
                    user_content.append({
                        "type": "image_url",
                        "image_url": {
                            "url": url
                        }
                    })
                self.last_image_urls = []
                user_content.append({
                    "type": "text",
                    "text": "用户名："+c_name+"发送了消息："+msg.content
                })
                self.memoryList[c_id].append({"role": "user", "content": user_content})
            else:
                self.memoryList[c_id].append({"role": "user", "content": "用户名："+ c_name +"发送了消息："+msg.content})

        try:
            asyncToolsID = []
            if c_id in self.asyncToolsID:
                asyncToolsID = self.asyncToolsID[c_id]
            else:
                self.asyncToolsID[c_id] = []
            if c_id in self.fileLinks:
                fileLinks = self.fileLinks[c_id]
            else:
                fileLinks = []
            stream = await self.client.chat.completions.create(
                model=self.WXAgent,
                messages=self.memoryList[c_id],
                stream=True,
                extra_body={
                    "asyncToolsID": asyncToolsID,
                    "fileLinks": fileLinks
                }
            )
            
            full_response = []
            text_buffer = ""
            
            async for chunk in stream:
                reasoning_content = ""
                tool_content = ""
                if chunk.choices:
                    chunk_dict = chunk.model_dump()
                    delta = chunk_dict["choices"][0].get("delta", {})
                    if delta:
                        reasoning_content = delta.get("reasoning_content", "")
                        tool_content = delta.get("tool_content", "")
                        async_tool_id = delta.get("async_tool_id", "")
                        tool_link = delta.get("tool_link", "")

                        if tool_link and settings["tools"]["toolMemorandum"]["enabled"]:
                            if c_id not in self.fileLinks:
                                self.fileLinks[c_id] = []
                            self.fileLinks[c_id].append(tool_link)
                            
                        if async_tool_id:
                            # 判断async_tool_id在不在self.asyncToolsID[c_id]中
                            if async_tool_id not in self.asyncToolsID[c_id]:
                                self.asyncToolsID[c_id].append(async_tool_id)

                            # 如果async_tool_id在self.asyncToolsID[c_id]中，则删除
                            else:
                                self.asyncToolsID[c_id].remove(async_tool_id)

                content = chunk.choices[0].delta.content or ""
                full_response.append(content)
                
                if reasoning_content and self.reasoningVisible:
                    content = reasoning_content
                if tool_content and self.reasoningVisible:
                    content = tool_content
                
                # 累积文本，按分隔符发送
                text_buffer += content
                
                # 检查是否有分隔符
                for separator in self.separators:
                    if separator in text_buffer:
                        parts = text_buffer.split(separator, 1)
                        if len(parts) > 1:
                            send_text = parts[0] + separator
                            text_buffer = parts[1]
                            clean_text = self._clean_text(send_text)
                            if clean_text:
                                self.wx.SendMsg(clean_text, who=c_id)
                            break
            
            # 发送剩余的文本
            if text_buffer.strip():
                self.wx.SendMsg(text_buffer.strip(), who=c_id)
            
            full_content = "".join(full_response)
            self.memoryList[c_id].append({"role": "assistant", "content": full_content})
            if self.memoryLimit > 0:
                while len(self.memoryList[c_id]) > self.memoryLimit:
                    self.memoryList[c_id].pop(0)
            
            # 提取并发送图片
            await self._send_images_from_response(full_content, c_id)
            
        except Exception as e:
            print(f"处理异常: {e}")
            self.wx.SendMsg(str(e), who=c_id)

    def _clean_text(self, text):
        """图片清洗"""
        # 移除图片标记
        clean = re.sub(r'!\[.*?\]\(.*?\)', '', text)
        return clean.strip()

    async def close(self):
        self._shutdown_requested = True
        self.is_running = False
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=True)
        logging.info("微信机器人已关闭")

    async def _send_images_from_response(self, response, sender):
        # 匹配 Markdown 格式的图片链接
        pattern = r'!\[.*?\]\((https?://[^\s\)]+)'
        matches = re.finditer(pattern, response)
        for match in matches:
            img_url = match.group(1)
            try:
                # 下载图片并保存到临时文件
                response_img = requests.get(img_url)
                if response_img.status_code == 200:
                    temp_file = tempfile.NamedTemporaryFile(delete=False, mode='wb')
                    temp_file.write(response_img.content)
                    temp_file.flush()
                    # 发送图片
                    self.wx.SendFiles(temp_file.name, who=sender)
                    temp_file.close()
            except Exception as e:
                print(f"图片发送失败: {e}")
                self.wx.SendMsg(f"图片发送失败: {e}", who=sender)