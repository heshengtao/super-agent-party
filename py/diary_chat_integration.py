import time
import logging
import datetime
import httpx

from py.get_setting import get_port, load_settings
from py.diary_system import append_diary_entry, DEFAULT_BOOK_ID

_chat_buffers = {}


def get_chat_buffer(key: str):
    if key not in _chat_buffers:
        _chat_buffers[key] = {
            "messages": [],
            "last_user_msg_time": time.time(),
            "book_id": DEFAULT_BOOK_ID,
            "character_name": "",
        }
    return _chat_buffers[key]


def append_to_chat_buffer(key: str, role: str, content: str):
    buf = get_chat_buffer(key)
    buf["messages"].append({"role": role, "content": str(content)[:2000]})
    if len(buf["messages"]) > 200:
        buf["messages"] = buf["messages"][-200:]
    if role == "user":
        buf["last_user_msg_time"] = time.time()


def update_buffer_identity(key: str, book_id: str = None, character_name: str = ""):
    buf = get_chat_buffer(key)
    if book_id:
        buf["book_id"] = book_id
    if character_name:
        buf["character_name"] = character_name


def resolve_character_name(settings: dict) -> str:
    """解析当前选中角色卡的显示名，用于给对话缓冲打"角色"标签。

    注意：不能用 memorySettings.userName —— 那是**用户**的名字，
    写进日记本 metadata 会让"角色名"变成用户名。
    找不到角色卡时返回空串（表示沿用日记本原有记录）。
    """
    try:
        ms = ((settings or {}).get("memorySettings") or {})
        mem_id = ms.get("selectedMemory")
        if not mem_id:
            return ""
        for mem in ((settings or {}).get("memories") or []):
            if mem.get("id") == mem_id:
                return (mem.get("name") or "").strip()
    except Exception:
        pass
    return ""


def get_idle_buffers(idle_minutes: int = 15):
    now = time.time()
    idle_threshold = now - idle_minutes * 60
    result = []
    for key, buf in list(_chat_buffers.items()):
        if not buf["messages"]:
            continue
        if buf["last_user_msg_time"] < idle_threshold:
            result.append((key, buf))
    return result


def clear_chat_buffer(key: str):
    buf = _chat_buffers.get(key)
    if buf:
        buf["messages"] = []
        buf["last_user_msg_time"] = time.time()


async def summarize_and_save_buffers(idle_minutes: int = 15):
    idle_list = get_idle_buffers(idle_minutes)
    if not idle_list:
        return
    for key, buf in idle_list:
        try:
            messages_text = ""
            for m in buf["messages"][-50:]:
                role_label = "用户" if m["role"] == "user" else "助手"
                messages_text += f"[{role_label}]: {m['content']}\n"
            if not messages_text.strip():
                clear_chat_buffer(key)
                continue

            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            sys_prompt = (
                f"当前时间：{now_str}。用户已经 {idle_minutes} 分钟没有与你对话。"
                "请将下方最近的对话记录总结为一篇简短的日记，用第一人称、自然真诚地书写。"
                "只需要总结要点、用户的需求或情绪、以及你的想法，不需要逐条复述。"
            )
            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": f"[最近的对话记录]:\n{messages_text}"},
            ]

            port = get_port()
            url = f"http://127.0.0.1:{port}/v1/chat/completions"
            payload = {
                "model": "super-model",
                "messages": messages,
                "stream": False,
                "is_app_bot": True,
                "platform": "diary",
                "enable_tools": [],
            }
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                summary = (data.get("choices", [{}])[0]
                           .get("message", {})
                           .get("content", "") or "").strip()
            if summary:
                title = summary.strip().splitlines()[0][:24] if summary.strip() else ""
                await append_diary_entry("chatSummary", summary, title=title,
                                         book_id=buf["book_id"],
                                         character_id=buf["book_id"] if buf["book_id"] != DEFAULT_BOOK_ID else None,
                                         character_name=buf.get("character_name", ""))
                logging.info(f"[DiaryChat] 已自动总结对话到日记 [{buf['book_id']}]")
            clear_chat_buffer(key)
        except Exception as e:
            logging.error(f"[DiaryChat] 总结对话失败 [{key}]: {e}")
