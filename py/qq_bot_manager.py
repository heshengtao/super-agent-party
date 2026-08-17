# qq_bot_manager.py
import asyncio
import json
import threading
import os
from typing import Optional, List, Dict
import weakref
import aiohttp
import botpy
from botpy.message import C2CMessage, GroupMessage
from openai import AsyncOpenAI
import logging
import re
import time
from pydantic import BaseModel
import requests
from PIL import Image
import io
import base64
from py.get_setting import get_port, load_settings

# 定义请求体
class QQBotConfig(BaseModel):
    QQAgent: str
    memoryLimit: int
    appid: str
    secret: str
    separators: List[str]
    reasoningVisible: bool
    quickRestart: bool
    is_sandbox: bool

class QQBotManager:
    def __init__(self):
        self.bot_thread: Optional[threading.Thread] = None
        self.bot_client: Optional[MyClient] = None
        self.is_running = False
        self.config = None
        self.loop = None
        self._shutdown_event = threading.Event()
        self._startup_complete = threading.Event()
        self._ready_complete = threading.Event()
        self._startup_error = None

    def start_bot(self, config):
        """在新线程中启动机器人"""
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
            name="QQBotThread"
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
        """在线程中运行机器人"""
        self.loop = None
        bot_task = None

        try:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

            self.bot_client = MyClient(intents=botpy.Intents(public_messages=True), is_sandbox=config.is_sandbox)
            self.bot_client.QQAgent = config.QQAgent
            self.bot_client.memoryLimit = config.memoryLimit
            self.bot_client.separators = config.separators if config.separators else []
            self.bot_client.reasoningVisible = config.reasoningVisible
            self.bot_client.quickRestart = config.quickRestart

            self.bot_client._manager_ref = weakref.ref(self)
            self.bot_client._ready_callback = self._on_bot_ready

            async def run_bot():
                try:
                    logging.info("开始连接QQ机器人...")
                    await self.bot_client.start(appid=config.appid, secret=config.secret)
                except asyncio.CancelledError:
                    logging.info("机器人任务被取消")
                except Exception as e:
                    logging.error(f"机器人运行时异常: {e}")
                    self._startup_error = str(e)
                    if not self._startup_complete.is_set():
                        self._startup_complete.set()
                    raise

            bot_task = self.loop.create_task(run_bot())

            async def delayed_connection_check():
                await asyncio.sleep(2)
                if not bot_task.done() and not self._startup_error:
                    self._startup_complete.set()
                    logging.info("机器人连接已建立，等待就绪...")

            self.loop.create_task(delayed_connection_check())
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
            self._cleanup()

    def _on_bot_ready(self):
        self.is_running = True
        self._ready_complete.set()
        logging.info("QQ机器人已完全就绪")

    def _cleanup(self):
        self.is_running = False
        if self.bot_client and self.loop and not self.loop.is_closed():
            try:
                self.bot_client._shutdown_requested = True
                if hasattr(self.bot_client, 'close'):
                    async def close_client():
                        try:
                            await self.bot_client.close()
                        except: pass
                    self.loop.run_until_complete(close_client())
            except: pass
        if self.loop and not self.loop.is_closed():
            self.loop.close()
        self.bot_client = None
        self.loop = None
        self._shutdown_event.set()

    def stop_bot(self):
        if not self.is_running and not self.bot_thread:
            return
        logging.info("正在停止QQ机器人...")
        self._shutdown_event.set()
        self.is_running = False
        if self.bot_client:
            self.bot_client._shutdown_requested = True
        if self.loop and not self.loop.is_closed():
            try:
                self.loop.call_soon_threadsafe(self.loop.stop)
            except: pass
        if self.bot_thread and self.bot_thread.is_alive():
            self.bot_thread.join(timeout=10)
        logging.info("QQ机器人已停止")

    def get_status(self):
        return {
            "is_running": self.is_running,
            "thread_alive": self.bot_thread.is_alive() if self.bot_thread else False,
            "config": self.config.model_dump() if self.config else None,
            "startup_error": self._startup_error
        }

class MyClient(botpy.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.is_running = False
        self.QQAgent = "super-model"
        self.memoryLimit = 10
        self.memoryList = {}
        self.asyncToolsID = {}
        self.fileLinks = {}
        self.separators = []
        self.reasoningVisible = False
        self.quickRestart = True
        self.port = get_port()
        self._shutdown_requested = False
        self._ready_callback = None
        self._ready_event = asyncio.Event()
        # 核心：用于管理每个会话的当前任务，实现打断功能
        self.active_tasks: Dict[str, asyncio.Task] = {}

    async def start(self, appid, secret):
        try:
            await super().start(appid=appid, secret=secret)
        except Exception as e:
            raise Exception(f"认证失败或配置错误: {e}")

    async def close(self):
        self._shutdown_requested = True
        self.is_running = False
        # 取消所有正在进行的对话任务
        for task in self.active_tasks.values():
            task.cancel()
        await super().close()

    async def on_ready(self):
        if self._shutdown_requested: return
        self.is_running = True
        self._ready_event.set()
        if self._ready_callback:
            self._ready_callback()
        logging.info("QQ机器人已就绪")

    async def on_c2c_message_create(self, message: C2CMessage):
        if not self.is_running: return
        c_id = message.author.user_openid

        # 1. 检查并处理快捷指令（统一快捷指令，受系统设置全局开关控制）
        from py import shortcut_commands
        if await shortcut_commands.im_shortcuts_enabled():
            content_clean = message.content.strip()
            action = shortcut_commands.parse_im_action(content_clean)
            if action == "stop":
                if c_id in self.active_tasks:
                    self.active_tasks[c_id].cancel()
                    await self._send_text_message(message, shortcut_commands.STOP_MSG_ZH)
                return
            if action == "reset":
                if c_id in self.active_tasks:
                    self.active_tasks[c_id].cancel()
                self.memoryList[c_id] = []
                await self._send_text_message(message, shortcut_commands.RESET_MSG_ZH)
                return
            if action == "help":
                await self._send_text_message(message, shortcut_commands.build_help_text("zh"))
                return
            if action == "skills":
                await self._send_text_message(message, await shortcut_commands.build_skills_text("zh"))
                return
            if action == "model":
                await self._send_text_message(message, await shortcut_commands.handle_model_command(content_clean, "zh"))
                return
            if action == "personality":
                await self._send_text_message(message, await shortcut_commands.handle_personality_command(content_clean, "zh"))
                return
            if action == "retry":
                await self._send_text_message(message, shortcut_commands.retry_hint("zh"))
                return
            if action == "mode":
                await self._send_text_message(message, await shortcut_commands.build_mode_info_text("zh"))
                return

        # 2. 如果当前用户有任务在跑，直接打断
        if c_id in self.active_tasks:
            self.active_tasks[c_id].cancel()
            logging.info(f"用户 {c_id} 发送新消息，打断旧任务")

        # 3. 创建新任务
        new_task = asyncio.create_task(self._process_c2c_logic(message))
        self.active_tasks[c_id] = new_task

        try:
            await new_task
        except asyncio.CancelledError:
            logging.info(f"任务 {c_id} 被正常取消")
        finally:
            if self.active_tasks.get(c_id) == new_task:
                self.active_tasks.pop(c_id, None)

    async def _process_c2c_logic(self, message: C2CMessage):
        """C2C消息的具体处理逻辑（封装以便支持取消）"""
        settings = await load_settings()
        client = AsyncOpenAI(api_key="super-secret-key", base_url=f"http://127.0.0.1:{self.port}/v1")
        c_id = message.author.user_openid

        # 初始化状态
        user_content = []
        image_url_list = []
        if message.attachments:
            for attachment in message.attachments:
                if attachment.content_type.startswith("image/"):
                    image_url_list.append(attachment.url)
                    # 转换图片逻辑...
                    async with aiohttp.ClientSession() as session:
                        async with session.get(attachment.url) as response:
                            if response.status == 200:
                                image_data = await response.read()
                                content_type = attachment.content_type.lower()
                                if content_type not in ["image/png", "image/jpeg", "image/gif"]:
                                    try:
                                        img = Image.open(io.BytesIO(image_data))
                                        if img.mode in ("RGBA", "LA", "P"): img = img.convert("RGB")
                                        jpg_buffer = io.BytesIO()
                                        img.save(jpg_buffer, format="JPEG", quality=95)
                                        image_data = jpg_buffer.getvalue()
                                        content_type = "image/jpeg"
                                    except: continue
                                base64_data = base64.b64encode(image_data).decode("utf-8")
                                user_content.append({"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{base64_data}"}})

        if user_content:
            user_content.append({"type": "text", "text": message.content + "图片链接：" + json.dumps(image_url_list)})
        else:
            user_content = message.content

        if c_id not in self.memoryList: self.memoryList[c_id] = []
        if not hasattr(self, 'msg_seq_counters'): self.msg_seq_counters = {}
        self.msg_seq_counters.setdefault(c_id, 1)

        if not hasattr(self, 'processing_states'): self.processing_states = {}
        self.processing_states[c_id] = {"text_buffer": "", "image_buffer": "", "image_cache": []}
        state = self.processing_states[c_id]

        self.memoryList[c_id].append({"role": "user", "content": user_content})

        try:
            asyncToolsID = self.asyncToolsID.get(c_id, [])
            fileLinks = self.fileLinks.get(c_id, [])

            stream = await client.chat.completions.create(
                model=self.QQAgent,
                messages=self.memoryList[c_id],
                stream=True,
                extra_body={"asyncToolsID": asyncToolsID, "fileLinks": fileLinks, "is_app_bot": True, "platform": "qq"}
            )

            full_response = []
            async for chunk in stream:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    reasoning_content = getattr(delta, "reasoning_content", "")
                    content = delta.content or ""

                    # 处理 Tool 逻辑
                    chunk_dict = chunk.model_dump()
                    delta_dict = chunk_dict["choices"][0].get("delta", {})
                    async_tool_id = delta_dict.get("async_tool_id", "")
                    tool_link = delta_dict.get("tool_link", "")

                    if tool_link and settings["tools"]["toolMemorandum"]["enabled"]:
                        self.fileLinks.setdefault(c_id, []).append(tool_link)
                    if async_tool_id:
                        if async_tool_id not in self.asyncToolsID.setdefault(c_id, []):
                            self.asyncToolsID[c_id].append(async_tool_id)
                        else:
                            self.asyncToolsID[c_id].remove(async_tool_id)

                    full_response.append(content)
                    display_content = reasoning_content if (reasoning_content and self.reasoningVisible) else content

                    state["text_buffer"] += display_content
                    state["image_buffer"] += display_content

                    # 实时分段发送
                    while self.separators:
                        buffer = state["text_buffer"]
                        split_pos = -1
                        for i, char in enumerate(buffer):
                            if char in self.separators:
                                split_pos = i + 1
                                break
                        if split_pos == -1: break
                        current_chunk = buffer[:split_pos]
                        state["text_buffer"] = buffer[split_pos:]
                        clean_text = self._clean_text(current_chunk)
                        if clean_text: await self._send_text_message(message, clean_text)

            self._extract_images_to_cache(c_id)
            if state["text_buffer"]:
                clean_text = self._clean_text(state["text_buffer"])
                if clean_text: await self._send_text_message(message, clean_text)

            await self._send_cached_images(message)

            final_content = "".join(full_response)
            self.memoryList[c_id].append({"role": "assistant", "content": final_content})
            if self.memoryLimit > 0:
                while len(self.memoryList[c_id]) > self.memoryLimit: self.memoryList[c_id].pop(0)

        except Exception as e:
            if not isinstance(e, asyncio.CancelledError):
                logging.error(f"C2C处理异常: {e}")
                await self._send_text_message(message, f"发生错误: {str(e)}")
        finally:
            self.processing_states.pop(c_id, None)

    async def on_group_at_message_create(self, message: GroupMessage):
        if not self.is_running: return
        g_id = message.group_openid

        # 指令检查（统一快捷指令，受系统设置全局开关控制）
        from py import shortcut_commands
        if await shortcut_commands.im_shortcuts_enabled():
            content_clean = message.content.strip()
            action = shortcut_commands.parse_im_action(content_clean)
            if action in ("stop", "reset", "help"):
                if not hasattr(self, 'group_states'): self.group_states = {}
                self.group_states.setdefault(g_id, {"msg_seq": 1})
            if action == "stop":
                if g_id in self.active_tasks:
                    self.active_tasks[g_id].cancel()
                    await self._send_group_text(message, shortcut_commands.STOP_MSG_ZH, self.group_states[g_id])
                return
            if action == "reset":
                if g_id in self.active_tasks:
                    self.active_tasks[g_id].cancel()
                self.memoryList[g_id] = []
                await self._send_group_text(message, shortcut_commands.RESET_MSG_ZH, self.group_states[g_id])
                return
            if action == "help":
                await self._send_group_text(message, shortcut_commands.build_help_text("zh"), self.group_states[g_id])
                return
            if action == "skills":
                await self._send_group_text(message, await shortcut_commands.build_skills_text("zh"), self.group_states[g_id])
                return
            if action == "model":
                await self._send_group_text(message, await shortcut_commands.handle_model_command(content_clean, "zh"), self.group_states[g_id])
                return
            if action == "personality":
                await self._send_group_text(message, await shortcut_commands.handle_personality_command(content_clean, "zh"), self.group_states[g_id])
                return
            if action == "retry":
                await self._send_group_text(message, shortcut_commands.retry_hint("zh"), self.group_states[g_id])
                return
            if action == "mode":
                await self._send_group_text(message, await shortcut_commands.build_mode_info_text("zh"), self.group_states[g_id])
                return

        # 打断旧任务
        if g_id in self.active_tasks:
            self.active_tasks[g_id].cancel()

        new_task = asyncio.create_task(self._process_group_logic(message))
        self.active_tasks[g_id] = new_task

        try:
            await new_task
        except asyncio.CancelledError:
            pass
        finally:
            if self.active_tasks.get(g_id) == new_task:
                self.active_tasks.pop(g_id, None)

    async def _process_group_logic(self, message: GroupMessage):
        """群聊消息处理逻辑"""
        settings = await load_settings()
        client = AsyncOpenAI(api_key="super-secret-key", base_url=f"http://127.0.0.1:{self.port}/v1")
        g_id = message.group_openid

        user_content = []
        image_url_list = []
        if message.attachments:
            for attachment in message.attachments:
                if attachment.content_type.startswith("image/"):
                    image_url_list.append(attachment.url)
                    async with aiohttp.ClientSession() as session:
                        async with session.get(attachment.url) as response:
                            if response.status == 200:
                                image_data = await response.read()
                                content_type = attachment.content_type.lower()
                                if content_type not in ["image/png", "image/jpeg", "image/gif"]:
                                    try:
                                        img = Image.open(io.BytesIO(image_data))
                                        if img.mode in ("RGBA", "LA", "P"): img = img.convert("RGB")
                                        jpg_buffer = io.BytesIO()
                                        img.save(jpg_buffer, format="JPEG", quality=95)
                                        image_data = jpg_buffer.getvalue()
                                        content_type = "image/jpeg"
                                    except: continue
                                base64_data = base64.b64encode(image_data).decode("utf-8")
                                user_content.append({"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{base64_data}"}})

        if user_content:
            user_content.append({"type": "text", "text": message.content + "图片链接：" + json.dumps(image_url_list)})
        else:
            user_content = message.content

        if g_id not in self.memoryList: self.memoryList[g_id] = []
        if not hasattr(self, 'group_states'): self.group_states = {}
        self.group_states[g_id] = {"msg_seq": 1, "text_buffer": "", "image_buffer": "", "image_cache": []}
        state = self.group_states[g_id]

        self.memoryList[g_id].append({"role": "user", "content": user_content})

        try:
            asyncToolsID = self.asyncToolsID.get(g_id, [])
            fileLinks = self.fileLinks.get(g_id, [])

            stream = await client.chat.completions.create(
                model=self.QQAgent,
                messages=self.memoryList[g_id],
                stream=True,
                extra_body={"asyncToolsID": asyncToolsID, "fileLinks": fileLinks, "is_app_bot": True, "platform": "qq"}
            )

            full_response = []
            async for chunk in stream:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    reasoning_content = getattr(delta, "reasoning_content", "")
                    content = delta.content or ""

                    chunk_dict = chunk.model_dump()
                    delta_dict = chunk_dict["choices"][0].get("delta", {})
                    async_tool_id = delta_dict.get("async_tool_id", "")
                    tool_link = delta_dict.get("tool_link", "")

                    if tool_link and settings["tools"]["toolMemorandum"]["enabled"]:
                        self.fileLinks.setdefault(g_id, []).append(tool_link)
                    if async_tool_id:
                        if async_tool_id not in self.asyncToolsID.setdefault(g_id, []):
                            self.asyncToolsID[g_id].append(async_tool_id)
                        else:
                            self.asyncToolsID[g_id].remove(async_tool_id)

                    full_response.append(content)
                    display_content = reasoning_content if (reasoning_content and self.reasoningVisible) else content

                    state["text_buffer"] += display_content
                    state["image_buffer"] += display_content

                    while self.separators:
                        buffer = state["text_buffer"]
                        split_pos = -1
                        for i, char in enumerate(buffer):
                            if char in self.separators:
                                split_pos = i + 1
                                break
                        if split_pos == -1: break
                        current_chunk = buffer[:split_pos]
                        state["text_buffer"] = buffer[split_pos:]
                        clean_text = self._clean_group_text(current_chunk)
                        if clean_text: await self._send_group_text(message, clean_text, state)

            self._cache_group_images(g_id)
            if state["text_buffer"]:
                clean_text = self._clean_group_text(state["text_buffer"])
                if clean_text: await self._send_group_text(message, clean_text, state)

            await self._send_group_images(message, g_id)

            final_content = "".join(full_response)
            self.memoryList[g_id].append({"role": "assistant", "content": final_content})
            if self.memoryLimit > 0:
                while len(self.memoryList[g_id]) > self.memoryLimit: self.memoryList[g_id].pop(0)

        except Exception as e:
            if not isinstance(e, asyncio.CancelledError):
                logging.error(f"群聊处理异常: {e}")
                await self._send_group_text(message, f"错误: {str(e)}", state)
        finally:
            self.group_states.pop(g_id, None)

    # --- 工具方法保持不变 ---

    def _extract_images_to_cache(self, c_id):
        state = self.processing_states.get(c_id)
        if not state: return
        temp_buffer = state["image_buffer"]
        state["image_buffer"] = ""
        pattern = r'!\[.*?\]\((https?://[^\s\)]+)'
        matches = re.finditer(pattern, temp_buffer)
        for match in matches:
            state["image_cache"].append(match.group(1))

    async def _send_text_message(self, message, text):
        c_id = message.author.user_openid
        await message._api.post_c2c_message(
            openid=c_id,
            msg_type=0,
            msg_id=message.id,
            content=text,
            msg_seq=self.msg_seq_counters.get(c_id, 1)
        )
        if c_id in self.msg_seq_counters: self.msg_seq_counters[c_id] += 1

    async def _send_cached_images(self, message):
        c_id = message.author.user_openid
        state = self.processing_states.get(c_id, {})
        for url in state.get("image_cache", []):
            try:
                if not re.match(r'^https?://', url): continue
                requests.get(url, timeout=5)
                upload_media = await message._api.post_c2c_file(openid=c_id, file_type=1, url=url)
                await message._api.post_c2c_message(
                    openid=c_id, msg_type=7, msg_id=message.id,
                    media=upload_media, msg_seq=self.msg_seq_counters.get(c_id, 1)
                )
                if c_id in self.msg_seq_counters: self.msg_seq_counters[c_id] += 1
            except: pass

    def _clean_text(self, text):
        clean = re.sub(r'!\[.*?\]\(.*?\)', '', text)
        clean = re.sub(r'\[.*?\]\(.*?\)', '', clean)
        clean = re.sub(r'https?://\S+', '', clean)
        clean = re.sub(r'<[^>]+>', '', clean)
        clean = re.sub(r'&\w+;', '', clean)
        return clean.strip()

    def _cache_group_images(self, g_id):
        state = self.group_states.get(g_id)
        if not state: return
        temp_buffer = state["image_buffer"]
        state["image_buffer"] = ""
        pattern = r'!\[.*?\]\((https?://[^\s\)]+)'
        matches = re.finditer(pattern, temp_buffer)
        for match in matches:
            state["image_cache"].append(match.group(1))

    async def _send_group_text(self, message, text, state):
        await message._api.post_group_message(
            group_openid=message.group_openid,
            msg_type=0,
            msg_id=message.id,
            content=text,
            msg_seq=state["msg_seq"]
        )
        state["msg_seq"] += 1

    async def _send_group_images(self, message, g_id):
        state = self.group_states.get(g_id, {})
        for url in state.get("image_cache", []):
            try:
                if not url.startswith(('http://', 'https://')): continue
                requests.get(url, timeout=5)
                upload_media = await message._api.post_group_file(
                    group_openid=message.group_openid, file_type=1, url=url
                )
                await message._api.post_group_message(
                    group_openid=message.group_openid, msg_type=7, msg_id=message.id,
                    media=upload_media, msg_seq=state["msg_seq"]
                )
                state["msg_seq"] += 1
            except: pass

    def _clean_group_text(self, text):
        clean = re.sub(r'!\[.*?\]\(.*?\)', '', text)
        clean = re.sub(r'\[.*?\]\(.*?\)', '', clean)
        clean = re.sub(r'https?://\S+', '', clean)
        clean = re.sub(r'<[^>]+>', '', clean)
        clean = re.sub(r'&\w+;', '', clean)
        return clean.strip()

    def __del__(self):
        try:
            for task in self.active_tasks.values(): task.cancel()
        except: pass
