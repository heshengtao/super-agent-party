# -- coding: utf-8 --

import inspect
import signal
import struct
import sys
import os
import argparse
import socket
import errno

from PIL import Image

_is_steam_build = os.environ.get("IS_STEAM_BUILD", "0") == "1"
from py.cli_tool import read_file_tool_local
from py.task_tools import query_task_progress
from py.ws_manager import ws_manager

# === Pre-load heavy tool modules at startup to avoid blocking first request ===
from py.web_search import (
    DDGsearch, searxng, Tavily_search, Google_search,
    Brave_search, Exa_search, Serper_search, bochaai_search,
    jina_crawler, Crawl4Ai_search, firecrawl_search, simple_fetch, markdown_new,
    duckduckgo_tool, searxng_tool, tavily_tool, google_tool,
    brave_tool, exa_tool, serper_tool, bochaai_tool,
    jina_crawler_tool, simple_fetch_tool, Crawl4Ai_tool, firecrawl_tool, markdown_new_tool,
)
from py.know_base import kb_tool, query_knowledge_base, rerank_knowledge_base
from py.agent_tool import get_agent_tool, agent_tool_call
from py.a2a_tool import get_a2a_tool, a2a_tool_call
from py.llm_tool import get_llm_tool, custom_llm_tool
from py.pollinations import (
    pollinations_image_tool, openai_image_tool, openai_chat_image_tool,
    pollinations_image, openai_image, openai_chat_image,
)
from py.code_interpreter import e2b_code_tool, local_run_code_tool, e2b_code, local_run_code
from py.custom_http import fetch_custom_http
from py.comfyui_tool import comfyui_tool_call
from py.utility_tools import (
    time_tool, weather_tool, location_tool, timer_weather_tool,
    wikipedia_summary_tool, wikipedia_section_tool, arxiv_tool,
    get_weather, get_location_coordinates, get_weather_by_city,
    get_wikipedia_summary_and_sections, get_wikipedia_section_content, search_arxiv_papers,
)
from py.autoBehavior import auto_behavior_tool, auto_behavior
from py.guard import load_safety_words, check_content_safety
from py.cdp_tool import (
    all_cdp_tools, list_pages, navigate_page, new_page, close_page, select_page,
    take_snapshot, wait_for, click, fill, hover, press_key, evaluate_script,
    take_screenshot, fill_form, drag, handle_dialog,
)
from py.computer_use_tool import (
    computer_use_tools, mouse_use_tools, keyboard_use_tools, desktopVision_use_tools,
    mouse_move, mouse_click, mouse_double_click, mouse_drag, mouse_scroll, mouse_hold,
    copy_to_input_box, keyboard_press, keyboard_sequence, keyboard_hotkey, keyboard_hold,
    logical_type, wait, screenshot, logical_click,
)
from py.mode_change import mode_change_tool, update_workspace_settings
from py.acpx_tools import acp_agent_tool, acpx_agent

# Extended CLI tool imports for dispatch_tool
from py.cli_tool import (
    docker_sandbox, list_files_tool, read_file_tool, read_file_range_tool,
    tail_file_tool, search_files_tool, edit_file_tool,
    edit_file_string_tool, glob_files_tool, todo_write_tool, list_processes_tool,
    get_process_logs_tool, kill_process_tool, docker_manage_ports_tool,
    read_skill_tool, shell_tool_local, list_files_tool_local,
    read_file_tool_local, read_file_range_tool_local, tail_file_tool_local,
    search_files_tool_local, edit_file_tool_local,
    edit_file_string_tool_local, glob_files_tool_local, todo_write_tool_local,
    local_net_tool, send_process_input_tool, read_skill_tool_local,
    get_tools_for_mode, get_local_tools_for_mode,
)
from py.task_tools import (
    create_subtask_tool, query_tasks_tool, cancel_subtask_tool, finish_task_tool, finish_main_task_tool,
    create_subtask, cancel_subtask, finish_task, finish_main_task,
)
from py.load_files import get_files_content, file_tool, image_tool
from py.diary_query_tool import diary_query_tool, diary_books_tool, handle_query_diary, handle_list_diary_books
from py.diary_chat_integration import append_to_chat_buffer, update_buffer_identity, get_chat_buffer
from py.diary_system import get_recent_diary_entries, DEFAULT_BOOK_ID as DIARY_DEFAULT_BOOK

import shortuuid
os.environ["MEM0_TELEMETRY"] = "False"
parser = argparse.ArgumentParser(description="Run the ASGI application server.")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=3456)
args, _ = parser.parse_known_args()

HOST = args.host
PREFERED_PORT = args.port

def is_addr_in_use_error(e):
    """跨平台判断是否为地址被占用错误"""
    if hasattr(e, 'errno'):
        if e.errno == errno.EADDRINUSE:
            return True
        # Windows 有时用 WSAEADDRINUSE (10048)
        if sys.platform == 'win32' and e.errno == 10048:
            return True
    # Windows winerror 属性
    if hasattr(e, 'winerror') and e.winerror == 10048:
        return True
    # macOS/Linux 错误消息
    if 'address already in use' in str(e).lower():
        return True
    return False

def is_permission_error(e):
    """跨平台判断是否为权限/拒绝访问错误"""
    if isinstance(e, PermissionError):
        return True
    if hasattr(e, 'errno'):
        if e.errno in (errno.EACCES, errno.EPERM):
            return True
        # Windows ERROR_ACCESS_DENIED (5)
        if sys.platform == 'win32' and e.errno == 13:
            return True
    if hasattr(e, 'winerror') and e.winerror in (5, 10013):
        return True
    err_str = str(e).lower()
    if any(x in err_str for x in ['permission', 'denied', 'access', 'not permitted']):
        return True
    return False

def force_bind_or_fallback(host, preferred_port):
    """
    跨平台端口绑定：
    1. 尝试强制绑定指定端口（处理TIME_WAIT）
    2. 如果被真正占用/无权限/系统保留，自动降级到随机端口
    3. 绝不抛出异常导致退出
    """
    # 尝试绑定首选端口
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # 关键：允许快速复用 TIME_WAIT 状态的端口
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, preferred_port))
        sock.close()
        return preferred_port
        
    except (socket.error, OSError, PermissionError) as e:
        # 判断错误类型
        if is_addr_in_use_error(e):
            reason = "in use"
        elif is_permission_error(e):
            reason = "permission denied/system reserved"
        else:
            reason = f"error ({e})"
        
        print(f"Port {preferred_port} unavailable ({reason}), auto-assigning...", 
              file=sys.stderr, flush=True)
        
        # 关闭失败的 socket
        try:
            if sock:
                sock.close()
        except:
            pass
        
        # 降级：让系统分配端口
        return auto_assign_port(host)
        
    except Exception as e:
        # 捕获所有其他异常
        print(f"Unexpected error binding port {preferred_port}: {e}, auto-assigning...", 
              file=sys.stderr, flush=True)
        try:
            if sock:
                sock.close()
        except:
            pass
        return auto_assign_port(host)

def auto_assign_port(host):
    """自动分配可用端口，带多重降级"""
    # 尝试 127.0.0.1
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, 0))
        port = sock.getsockname()[1]
        sock.close()
        print(f"Auto-assigned port: {port}", file=sys.stderr, flush=True)
        return port
    except Exception as e:
        print(f"Failed to bind {host}: {e}", file=sys.stderr, flush=True)
        try:
            sock.close()
        except:
            pass
    
    # 降级 1: 尝试 0.0.0.0 (所有接口)
    if host != "0.0.0.0":
        try:
            print("Trying 0.0.0.0...", file=sys.stderr, flush=True)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", 0))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Auto-assigned port on 0.0.0.0: {port}", file=sys.stderr, flush=True)
            return port
        except Exception as e:
            print(f"Failed to bind 0.0.0.0: {e}", file=sys.stderr, flush=True)
            try:
                sock.close()
            except:
                pass
    
    # 降级 2: 尝试 localhost
    if host != "localhost":
        try:
            print("Trying localhost...", file=sys.stderr, flush=True)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("localhost", 0))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Auto-assigned port on localhost: {port}", file=sys.stderr, flush=True)
            return port
        except Exception as e:
            print(f"Failed to bind localhost: {e}", file=sys.stderr, flush=True)
            try:
                sock.close()
            except:
                pass
    
    # 最后手段：硬编码高位端口（极端情况）
    fallback_ports = [45678, 45679, 45680, 0]
    for fp in fallback_ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host if host != "0.0.0.0" else "127.0.0.1", fp))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Fallback to hardcoded port: {port}", file=sys.stderr, flush=True)
            return port
        except:
            try:
                sock.close()
            except:
                pass
            continue
    
    # 理论上不会到这里，如果真的到了，返回一个肯定能用的
    return 0

# 执行端口查找
FINAL_PORT = force_bind_or_fallback(HOST, PREFERED_PORT)
PORT = FINAL_PORT
os.environ['DYNAMIC_PORT'] = str(FINAL_PORT)

# 同时调用 change_port 保持同步
from py.get_setting import change_port, reset_user_data_dir, set_custom_user_data_dir
change_port(FINAL_PORT)

# ==========================================
# 第二步：屏蔽掉后面库可能产生的骚扰警告
# ==========================================
import warnings
warnings.filterwarnings("ignore") # 忽略普通警告
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' # 如果有 tensorflow 等库，减少其日志输出

import hashlib
import importlib
import mimetypes
import pathlib
import sys
import traceback
import platform
import requests

from py.agent import add_tool_to_project_config, is_tool_allowed_by_project_config
sys.stdout.reconfigure(encoding='utf-8')
import base64
from datetime import datetime
import glob
from io import BytesIO
import io
import os
from pathlib import Path
import pickle
import socket
import sys
import tempfile
import httpx
import ipaddress
from urllib.parse import urlparse, urlunparse, urljoin
from urllib.robotparser import RobotFileParser
import websockets
from py.load_files import check_robots_txt, get_file_content, is_private_ip, sanitize_url

# 修复 sherpa-onnx 在 macOS arm64 上的 onnxruntime dylib 路径问题
import site
try:
    _sp = site.getsitepackages()[0]
    _sherpa_lib = os.path.join(_sp, "sherpa_onnx", "lib")
    _onnx_capi = os.path.join(_sp, "onnxruntime", "capi")
    import glob as _glob
    _dylibs = _glob.glob(os.path.join(_onnx_capi, "libonnxruntime*.dylib"))
    if _dylibs:
        _dylib = _dylibs[0]
        _target = os.path.join(_sherpa_lib, os.path.basename(_dylib))
        if not os.path.exists(_target):
            os.makedirs(_sherpa_lib, exist_ok=True)
            os.symlink(os.path.abspath(_dylib), _target)
except Exception:
    pass

def fix_macos_environment():
    """
    专门修复 macOS 下找不到 node (nvm) 和 uv (python framework) 的问题
    """
    if sys.platform != 'darwin':
        return

    user_home = Path.home()
    paths_to_add = []

    # ---------------------------------------------------------
    # 1. 自动发现 NVM 安装的 Node.js
    # 路径通常是: ~/.nvm/versions/node/vX.X.X/bin
    # ---------------------------------------------------------
    nvm_path = user_home / ".nvm" / "versions" / "node"
    if nvm_path.exists():
        # 获取所有版本文件夹 (如 v20.19.5, v18.0.0)
        # 使用 glob 匹配所有 v 开头的文件夹
        node_versions = sorted(nvm_path.glob("v*"), key=lambda p: p.name, reverse=True)
        
        # 将所有版本的 bin 目录都加入，或者只加最新的
        for version_dir in node_versions:
            bin_path = version_dir / "bin"
            if bin_path.exists():
                paths_to_add.append(str(bin_path))
                # 如果只想用最新的 node，这里可以 break
                # break 

    # ---------------------------------------------------------
    # 2. 自动发现 Python Framework 中的 uv
    # 路径通常是: /Library/Frameworks/Python.framework/Versions/X.X/bin
    # ---------------------------------------------------------
    py_framework_path = Path("/Library/Frameworks/Python.framework/Versions")
    if py_framework_path.exists():
        # 查找所有版本，如 3.13, 3.12
        py_versions = py_framework_path.glob("*")
        for ver in py_versions:
            bin_path = ver / "bin"
            if bin_path.exists():
                paths_to_add.append(str(bin_path))

    # ---------------------------------------------------------
    # 3. 补充 macOS 常见的其他路径 (Homebrew, Cargo, Local)
    # uv 也经常被安装在 .local/bin 或 .cargo/bin 下
    # ---------------------------------------------------------
    common_extras = [
        "/opt/homebrew/bin",           # Apple Silicon Mac Homebrew
        "/usr/local/bin",              # Intel Mac Homebrew
        str(user_home / ".local" / "bin"), # 用户级安装通常在这里
        str(user_home / ".cargo" / "bin"), # Rust 工具链 (uv 可能在这里)
    ]
    paths_to_add.extend(common_extras)

    # ---------------------------------------------------------
    # 4. 将发现的路径注入到当前进程的环境变量中
    # ---------------------------------------------------------
    current_path = os.environ.get("PATH", "")
    new_path_str = current_path
    
    # 将新路径加到最前面 (优先级最高)
    for p in paths_to_add:
        if p and os.path.isdir(p):
            # 避免重复添加
            if p not in new_path_str:
                new_path_str = p + os.pathsep + new_path_str
    
    # 更新环境变量
    os.environ['PATH'] = new_path_str
    
    # (可选) 打印调试信息
    # print(f"Fixed macOS PATH. Added: {paths_to_add}")

# --- 在程序最开始的地方调用这个函数 ---
fix_macos_environment()

def _fix_onnx_dll():
    if sys.platform == 'darwin':
        return
    # 1. 找到 uv 虚拟环境里的 onnxruntime
    spec = importlib.util.find_spec("onnxruntime")
    if spec is None or spec.origin is None:
        return          # 没装 onnxruntime，随它去
    # DLL 就在 site-packages/onnxruntime/capi 里
    dll_dir = pathlib.Path(spec.origin).with_name("capi")
    if not dll_dir.is_dir():
        return

    # 2. 置顶搜索路径
    os.environ["PATH"] = str(dll_dir) + os.pathsep + os.environ["PATH"]
    if hasattr(os, "add_dll_directory"):      # Python 3.8+
        os.add_dll_directory(str(dll_dir))

    # 3. 如果已经有人 import 过 onnxruntime，清掉缓存
    for mod in list(sys.modules):
        if mod.startswith("onnxruntime"):
            del sys.modules[mod]

_fix_onnx_dll()

# 在程序最开始设置
if hasattr(sys, '_MEIPASS'):
    # 打包后的程序
    os.environ['PYTHONPATH'] = sys._MEIPASS
    os.environ['PATH'] = sys._MEIPASS + os.pathsep + os.environ.get('PATH', '')
import asyncio
import copy
from functools import partial
import json
import re
import shutil
from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, Request, WebSocketDisconnect
from fastapi_mcp import FastApiMCP
import logging
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel
from fastapi import status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse,Response
import uuid
import time
from typing import Any, AsyncIterator, List, Dict,Optional, Tuple, Union
import shortuuid
from py.mcp_clients import McpClient
from contextlib import asynccontextmanager, suppress
from concurrent.futures import ThreadPoolExecutor
import aiofiles
import argparse
from py.dify_openai import DifyOpenAIAsync
from py.ClaudeAsOpenAI import AsyncClaudeAsOpenAI
from py.GeminiAsOpenAI import AsyncGeminiAsOpenAI
from py.get_setting import EXT_DIR, IS_DOCKER, SKILLS_DIR, _copy_default_skills, convert_to_opus_simple, load_covs, load_settings, save_covs, save_single_cov, save_settings,clean_temp_files_task,base_path,configure_host_port,UPLOAD_FILES_DIR,AGENT_DIR,MEMORY_CACHE_DIR,KB_DIR,DEFAULT_VRM_DIR,DEFAULT_THA_DIR,THA_USER_MODELS_DIR,USER_DATA_DIR,LOG_DIR,TOOL_TEMP_DIR,COVS_PATH,DATABASE_PATH
from py.llm_tool import get_image_base64,get_image_media_type
timetamp = time.time()
log_path = os.path.join(LOG_DIR, f"backend_{timetamp}.log")

logger = None      
os.environ["no_proxy"] = "localhost,127.0.0.1"
local_timezone = None
settings = None
client = None
fast_client = None 
reasoner_client = None
HA_client = None
ChromeMCP_client = None
sql_client = None
mcp_client_list = {}
node_ext_mcp_clients: Dict[str, McpClient] = {}
node_ext_mcp_tools: Dict[str, List[Dict]] = {}  # 存储每个扩展的工具列表
locales = {}
sleep_guard = None
scheduler_task = None
global_http_client = None  # 用于共享底层的 TCP 连接池
openai_tts_clients_cache = {}  # 缓存 OpenAI TTS Client
tetos_speakers_cache = {}      # 缓存 Tetos Speaker 对象
openai_asr_clients_cache = {}
_TOOL_HOOKS = {}
ALLOWED_EXTENSIONS = [
  # 办公文档
    'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
    'numbers', 'key', 'rtf', 'odt', 'epub',
  
  # 编程开发
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',
  
  # 数据配置
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
]
ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'avi']

# 1. 先清空系统可能给错的条目
for ext in ("js", "mjs", "css", "html", "htm", "json", "xml", "map", "svg"):
    mimetypes.add_type("", f".{ext}")          # 先删掉
# 2. 再写死我们想要的
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("text/html", ".htm")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("application/xml", ".xml")
mimetypes.add_type("application/json", ".map")
mimetypes.add_type("image/svg+xml", ".svg")

import platform
import ctypes
import io
if platform.system() == "Windows":
    try:
        # 设置 DPI 感知，确保截屏尺寸和 size() 返回的一致
        ctypes.windll.shcore.SetProcessDpiAwareness(1) 
    except Exception:
        ctypes.windll.user32.SetProcessDPIAware()

def draw_grid_on_image(image, grid_spacing: int = 10):
    """在图片上绘制网格和千分比坐标标签"""
    from PIL import ImageDraw
    draw = ImageDraw.Draw(image)
    width, height = image.size
    
    # 颜色设置 (半透明红色或亮绿色，视情况而定)
    line_color = (255, 0, 0, 128)  # 红色线
    text_color = (255, 0, 0, 255)
    
    # 绘制垂直线 (百分比 0-100，但标签显示为千分比 0-1000‰)
    for x_pc in range(0, 101, grid_spacing):
        x = int(width * (x_pc / 100.0))
        # 确保不超出边界
        x = min(x, width - 1)
        draw.line([(x, 0), (x, height)], fill=line_color, width=1)
        x_permille = x_pc
        draw.text((x + 2, 5), f"{x_permille}%", fill=text_color)

    # 绘制水平线
    for y_pc in range(0, 101, grid_spacing):
        y = int(height * (y_pc / 100.0))
        y = min(y, height - 1)
        draw.line([(0, y), (width, y)], fill=line_color, width=1)
        y_permille = y_pc
        draw.text((5, y + 2), f"{y_permille}%", fill=text_color)
        
    return image

def draw_action_feedback(image, action_str: str):
    """
    解析返回结果字符串，并在图像上绘制动作反馈轨迹。
    （已针对红色网格优化，全面移除红色，使用高对比度的青/蓝/绿/黄色）
    """
    from PIL import ImageDraw, Image
    image = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = image.size
    
    def to_px(tx, ty):
        return int(float(tx) * w / 1000), int(float(ty) * h / 1000)

    # 1. 匹配 MOVE(x,y) -> 画个白色小圆点带黑边
    move_match = re.search(r"\[LAST_ACTION: MOVE\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if move_match:
        x, y = move_match.groups()
        px, py = to_px(x, y)
        r = 6
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(255, 255, 255, 200), outline=(0, 0, 0, 255), width=1)

    # 2. 匹配 CLICK(x,y) -> 画个青色(Cyan)半透明十字靶心 (对比红色网格极佳)
    click_match = re.search(r"\[LAST_ACTION: CLICK\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if click_match:
        x, y = click_match.groups()
        px, py = to_px(x, y)
        r = 12
        # 青色底圈
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(0, 255, 255, 150), outline=(255, 255, 255, 255), width=2)
        # 白色十字
        draw.line([px-r-5, py, px+r+5, py], fill=(255, 255, 255, 255), width=2)
        draw.line([px, py-r-5, px, py+r+5], fill=(255, 255, 255, 255), width=2)

    # 3. 匹配 DOUBLE_CLICK(x,y) -> 画个蓝色(Blue)双圈靶心
    dclick_match = re.search(r"\[LAST_ACTION: DOUBLE_CLICK\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if dclick_match:
        x, y = dclick_match.groups()
        px, py = to_px(x, y)
        r = 14
        # 蓝色底圈
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(0, 100, 255, 150), outline=(255, 255, 255, 255), width=2)
        # 内层白圈
        draw.ellipse([px-(r-4), py-(r-4), px+(r-4), py+(r-4)], outline=(255, 255, 255, 255), width=1)

    # 4. 匹配 DRAG(x1,y1,x2,y2) -> 绿色轨迹线，绿色起点，黄色终点
    drag_match = re.search(r"\[LAST_ACTION: DRAG\((\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if drag_match:
        x1, y1, x2, y2 = drag_match.groups()
        p1 = to_px(x1, y1)
        p2 = to_px(x2, y2)
        
        # 绿色带透明度的连接线
        draw.line([p1, p2], fill=(0, 255, 0, 200), width=4)
        
        # 绿色起点圆
        draw.ellipse([p1[0]-6, p1[1]-6, p1[0]+6, p1[1]+6], fill=(0, 255, 0, 255), outline=(255,255,255,255), width=1)
        
        # 黄色终点靶心 (黄色在网格上也很显眼)
        r_end = 8
        draw.ellipse([p2[0]-r_end, p2[1]-r_end, p2[0]+r_end, p2[1]+r_end], fill=(255, 215, 0, 180), outline=(255,255,255,255), width=2)

    # 合并图层，转回 RGB (防 JPG 格式不支持 Alpha 通道)
    combined = Image.alpha_composite(image, overlay)
    return combined.convert("RGB")

def scale_to_fit(width: int, height: int, max_w: int = 1920, max_h: int = 1080) -> tuple[int, int]:
    """计算等比例缩放后的尺寸"""
    # 计算宽和高的缩放比例
    scale_w = max_w / width
    scale_h = max_h / height
    
    # 取较小的那个缩放比例，确保长宽都不超过限制
    scale = min(scale_w, scale_h, 1.0) # 如果原图比 1920x1080 小，则不放大(1.0)
    
    new_width = int(width * scale)
    new_height = int(height * scale)
    return new_width, new_height

def _get_target_message(message, role):
    """
    根据角色获取目标消息
    
    参数:
        message (list): 消息列表引用
        role (str): 要操作的角色，可选值: 'user', 'assistant', 'system'
    
    返回:
        dict: 目标消息字典
    """
    # 验证输入参数
    if not isinstance(message, list):
        raise TypeError("message必须是列表类型")
    
    if role not in ['user', 'assistant', 'system']:
        raise ValueError("role必须是'user'或'assistant'或'system'")
    
    target_message = None
    
    # 根据role决定要操作的对象
    if role == 'user':
        # 查找最后一个role为'user'的消息
        for msg in reversed(message):
            if isinstance(msg, dict) and msg['role'] == 'user':
                target_message = msg
                break
    elif role == 'assistant':
        # 检查最后一个消息
        if message and message[-1]['role'] == 'assistant':
            target_message = message[-1]
        else:
            # 如果最后一个消息不是assistant，创建一个新的
            new_assistant_msg = {'role': 'assistant', 'content': '','reasoning_content': ''}
            message.append(new_assistant_msg)
            target_message = new_assistant_msg
    elif role == 'system':
        # 查找第一个role为'system'的消息
        if message and message[0]['role'] == 'system':
            target_message = message[0]
        else:
            # 如果没有找到system消息，创建一个新的
            target_message = {'role': 'system', 'content': ''}
            message.insert(0, target_message)
    
    return target_message

def content_append(message, role, content):
    """
    将content添加到指定role消息的末尾
    """
    target_message = _get_target_message(message, role)
    if target_message:
        current_content = target_message.get('content', '')
        target_message['content'] = current_content + content

def content_prepend(message, role, content):
    """
    将content添加到指定role消息的前面
    """
    target_message = _get_target_message(message, role)
    if target_message:
        current_content = target_message.get('content', '')
        target_message['content'] = content + current_content

def content_replace(message, role, content):
    """
    用content替换指定role消息的内容
    """
    target_message = _get_target_message(message, role)
    if target_message:
        target_message['content'] = content

def content_new(message, role, content):
    """
    用content替换指定role消息的内容
    """
    message.append({'role': role, 'content': content})

configure_host_port(args.host, args.port)

def get_client_class(config, provider_id):
    if not config or 'modelProviders' not in config:
        return AsyncOpenAI
    vendor = 'OpenAI'
    for provider in config['modelProviders']:
        if provider['id'] == provider_id:
            vendor = provider['vendor']
            break
    # 假设你已经导入了 DifyOpenAIAsync 和 AsyncOpenAI
    if vendor == 'Dify':
        return DifyOpenAIAsync 
    elif vendor == 'customAnthropic':
        return AsyncClaudeAsOpenAI
    elif vendor == 'Gemini':
        return AsyncGeminiAsOpenAI
    else: 
        return AsyncOpenAI

from py.node_runner import node_mgr

def _wrap_client_chat_with_retry(client, max_retries=3, base_delay=1.0):
    RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
    RETRYABLE_EXCEPTIONS = (
        httpx.ConnectError, httpx.ReadError, httpx.ReadTimeout,
        httpx.ConnectTimeout, httpx.RemoteProtocolError, httpx.WriteError,
        httpx.PoolTimeout, httpx.NetworkError,
        asyncio.TimeoutError, ConnectionError,
    )

    _original_create = client.chat.completions.create

    async def _create_with_retry(*args, **kwargs):
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    delay = base_delay * (2 ** (attempt - 1))
                    print(f"[Retry] chat.completions.create 第 {attempt}/{max_retries} 次重试, 等待 {delay:.1f}s...")
                    await asyncio.sleep(delay)
                return await _original_create(*args, **kwargs)
            except Exception as e:
                last_error = e
                if isinstance(e, httpx.HTTPStatusError):
                    if e.response.status_code in RETRYABLE_STATUSES:
                        print(f"[Retry] HTTP {e.response.status_code}, 将重试")
                        continue
                    raise
                if isinstance(e, RETRYABLE_EXCEPTIONS):
                    print(f"[Retry] 网络错误 {type(e).__name__}: {e}, 将重试")
                    continue
                raise
        raise last_error

    client.chat.completions.create = _create_with_retry

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- [核心防御] 立即清理系统环境变量中的 SOCKS 代理，防止 httpx 崩溃 ---
    for env_key in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']:
        val = os.environ.get(env_key, "")
        if val.lower().startswith('socks'):
            # 彻底移除会导致崩溃的 socks 环境变量
            os.environ.pop(env_key, None)

    # 1. 准备所有独立的初始化任务
    from py.get_setting import init_db, init_covs_db, load_settings, save_settings
    from tzlocal import get_localzone
    
    asyncio.create_task(clean_temp_files_task())
    
    # 并行执行耗时操作
    init_db_task = init_db()
    init_covs_task = init_covs_db()
    load_locales_task = asyncio.to_thread(lambda: json.load(open(base_path + "/config/locales.json", "r", encoding="utf-8")))
    settings_task = load_settings() 
    timezone_task = asyncio.to_thread(get_localzone)
    copy_skills_task = _copy_default_skills()
    
    results = await asyncio.gather(
        init_db_task, 
        init_covs_task, 
        load_locales_task, 
        settings_task, 
        timezone_task,
        copy_skills_task
    )
    
    # 2. 解包结果
    global settings, client, reasoner_client, fast_client, mcp_client_list, local_timezone, logger, locales, global_http_client,scheduler_task,sleep_guard
    _, _, locales, settings, local_timezone, _ = results
    
    from py.sleep_guard import SleepGuard
    sleep_guard = SleepGuard(verbose=True)

    load_safety_words()

    if _is_steam_build:
        settings.setdefault("systemSettings", {})
        settings["systemSettings"]["contentSafety"] = True

    try:
        await asyncio.to_thread(sleep_guard.start)
        if sleep_guard.is_running():
            print("🛡️ 防休眠保护已启动，系统将不会自动休眠")
        else:
            print("⚠️ 防休眠启动失败，系统可能会在空闲时休眠")
    except Exception as e:
        print(f"防休眠启动异常: {e}")


    from py.scheduler import AgentScheduler
    # 传入全局 settings 对象的引用
    # 因为 python 字典是引用传递，后续 UI 修改了 settings，这里拿到的也是最新的
    scheduler = AgentScheduler(settings)
    scheduler_task = asyncio.create_task(scheduler.start_loop())

    # --- [日记系统引擎初始化] ---
    # 引擎循环常驻，未启用时空转；保存设置时通过 update_config 热更新。
    try:
        from py.diary_engine import global_diary_engine
        global_diary_engine.update_config((settings or {}).get("diarySettings"))
        diary_engine_task = asyncio.create_task(global_diary_engine.start())
    except Exception as e:
        print(f"日记引擎启动异常: {e}")
        diary_engine_task = None

    # --- [日志系统初始化] ---

    timestamp = time.time()
    log_path = os.path.join(LOG_DIR, f"backend_{timestamp}.log")
    logger = logging.getLogger("app")

    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # 1. 格式化器（控制台和文件共用一套格式）
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        
        # 2. 控制台输出（保留，方便实时看）
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # 3. 【新增】文件输出（这才是真正存盘的）
        # 确保目录存在，否则会报错
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding='utf-8')
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    logger.info("===== 日志系统初始化成功 =====")
    logger.info(f"用户数据目录: {USER_DATA_DIR}")
    logger.info(f"设置数据库路径: {DATABASE_PATH}")
    logger.info(f"日志文件保存至: {log_path}")  # 额外加一行，方便确认路径

    # --- [代理与 HTTP 客户端初始化] ---
    proxy_url = None
    trust_env = False
    
    if settings:
        sys_set = settings.get("systemSettings", {})
        mode = sys_set.get("proxyMode")
        manual_url = sys_set.get("proxy", "").strip()
        isChinaProxy = sys_set.get("isChinaProxy", False)

        if mode == "manual" and manual_url:
            # 手动模式：如果是 socks，由于没安装库，直接跳过并警告
            if manual_url.lower().startswith("socks"):
                logger.error("检测到手动设置了 SOCKS 代理，但当前环境不支持。代理已失效。")
                proxy_url = None
            else:
                proxy_url = manual_url
        elif mode == "system":
            # 系统模式：信任环境（此时环境里已经没有 socks 了，很安全）
            trust_env = True
        if isChinaProxy:
            # 2. 注入 Node.js / NPM 镜像源 (重点)
            # 设置这个环境变量后，所有的 npm install (包括你的 node_runner) 都会默认使用这个源
            os.environ["npm_config_registry"] = "https://registry.npmmirror.com/"
            
            # 3. 注入 UV / Pip 镜像源 (重点)
            # 这样后续如果调用 uv 或 pip，也会自动使用国内镜像
            os.environ["UV_INDEX_URL"] = "https://mirrors.aliyun.com/pypi/simple/"

    # 初始化全局带连接池的 HTTP 客户端
    timeout_config = httpx.Timeout(60.0, connect=10.0)
    global_http_client = httpx.AsyncClient(
        timeout=timeout_config,
        proxy=proxy_url,
        trust_env=trust_env
    )

    # --- [模型 Client 初始化] ---
    # 辅助函数：统一注入 global_http_client
    def create_model_client(provider_key, config_node=None):
        if not settings:
            fallback = AsyncOpenAI(http_client=global_http_client)
            _wrap_client_chat_with_retry(fallback)
            return fallback

        target_cfg = config_node if config_node else settings
        p_name = target_cfg.get('selectedProvider', settings.get('selectedProvider'))
        c_cls = get_client_class(settings, p_name)

        raw_client = c_cls(
            api_key=target_cfg.get('api_key') or settings.get('api_key', ''),
            base_url=target_cfg.get('base_url') or settings.get('base_url') or "https://api.openai.com/v1",
            http_client=global_http_client  # 强制使用我们定义的带代理控制的客户端
        )
        _wrap_client_chat_with_retry(raw_client)
        return raw_client

    if settings:
        client = create_model_client('main')
        reasoner_client = create_model_client('reasoner', settings.get('reasoner', {}))
        
        fast_cfg = settings.get('fast', {})
        if fast_cfg.get('enabled'):
            fast_client = create_model_client('fast', fast_cfg)
        else:
            fast_client = None
    else:
        client = AsyncOpenAI(http_client=global_http_client)
        reasoner_client = AsyncOpenAI(http_client=global_http_client)
        fast_client = AsyncOpenAI(http_client=global_http_client)
        _wrap_client_chat_with_retry(client)
        _wrap_client_chat_with_retry(reasoner_client)
        _wrap_client_chat_with_retry(fast_client)

    # --- [其他初始化：ASR / MCP] ---
    try:
        from py.sherpa_asr import _get_recognizer
        asyncio.get_running_loop().run_in_executor(None, _get_recognizer)
    except Exception as e:
        logger.error(f"尝试启动sherpa失败: {e}")

    try:
        from py.moss_tts import _get_moss_runtime
        # 将重型的本地 TTS 加载也扔到后台线程池，如果没有下载模型它只会静默返回 None
        asyncio.get_running_loop().run_in_executor(None, _get_moss_runtime)
    except Exception as e:
        logger.error(f"尝试预热 MOSS TTS 失败: {e}")

    # MCP 初始化逻辑 (保持你原有的逻辑，但内部会复用 global_http_client)
    mcp_init_tasks = []

    async def init_mcp_with_timeout(server_name: str, server_config: dict, timeout=6.0, max_wait_failure=5.0):
        if server_config.get("disabled"):
            return server_name, None, "disabled"
        
        mcp_client = mcp_client_list.get(server_name) or McpClient()
        mcp_client_list[server_name] = mcp_client
        failure_event = asyncio.Event()
        first_error = None

        async def on_failure(msg: str):
            nonlocal first_error
            if first_error: return
            first_error = msg
            logger.error(f"MCP {server_name} failure: {msg}")
            settings.setdefault("mcpServers", {}).setdefault(server_name, {})["disabled"] = True
            mcp_client.disabled = True
            await mcp_client.close()
            failure_event.set()

        init_task = asyncio.create_task(mcp_client.initialize(server_name, server_config, on_failure_callback=on_failure))
        try:
            await asyncio.wait_for(init_task, timeout=timeout)
            try:
                await asyncio.wait_for(failure_event.wait(), timeout=max_wait_failure)
            except asyncio.TimeoutError:
                pass
            return server_name, (None if first_error else mcp_client), first_error
        except Exception as exc:
            return server_name, None, str(exc)
        finally:
            if not init_task.done(): init_task.cancel()

    async def check_results():
        for task in asyncio.as_completed(mcp_init_tasks):
            name, m_client, err = await task
            if err:
                settings['mcpServers'][name]['processingStatus'] = 'server_error'
            elif m_client:
                mcp_client_list[name] = m_client
        await save_settings(settings)
        await ws_manager.broadcast_settings_update(settings)

    if settings and settings.get('mcpServers'):
        mcp_init_tasks = [asyncio.create_task(init_mcp_with_timeout(k, v)) for k, v in settings['mcpServers'].items()]
        if mcp_init_tasks: asyncio.create_task(check_results())
    else:
        asyncio.create_task(ws_manager.broadcast_settings_update(settings or {}))

    # --- [启动完成] ---
    print(f"REAL_PORT_FOUND:{PORT}", flush=True)
    yield

    # --- [关闭逻辑] ---
    print("System shutting down, cleaning up...")

    try:
        # 注意：此处需要根据您实际的文件结构导入 process_manager
        # 假设上述 ProcessManager 代码保存在 py/agent_tool.py 中
        from py.cli_tool import process_manager 
        
        print("正在清理工具管理的后台进程...")
        await process_manager.kill_all()
    except Exception as e:
        print(f"清理后台进程时发生异常: {e}")

    try:
        await asyncio.to_thread(sleep_guard.stop)
        print("🛡️ 防休眠保护已停止，系统将恢复正常休眠策略")
    except Exception as e:
        print(f"防休眠停止异常: {e}")

    if scheduler_task:
        scheduler_task.cancel()
    try:
        if diary_engine_task:
            from py.diary_engine import global_diary_engine
            global_diary_engine.stop()
            diary_engine_task.cancel()
    except Exception as e:
        print(f"日记引擎停止异常: {e}")
    from py.node_runner import node_mgr
    ext_ids = list(node_mgr.exts.keys())
    for ext_id in ext_ids:
        try: await node_mgr.stop(ext_id)
        except: pass

    if global_http_client:
        await global_http_client.aclose()
    print("All processes terminated.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def cors_options_workaround(request: Request, call_next):
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",   # 预检缓存 24 h
            }
        )
    return await call_next(request)

@app.middleware("http")
async def inject_steam_build_flag(request: Request, call_next):
    response = await call_next(request)
    if _is_steam_build and "text/html" in response.headers.get("content-type", ""):
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        body_str = body.decode("utf-8")
        body_str = body_str.replace("</head>", '<script>window.__IS_STEAM_BUILD__=true;</script></head>')
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return HTMLResponse(content=body_str, status_code=response.status_code, headers=headers)
    return response

async def t(text: str) -> str:
    global locales
    settings = await load_settings()
    target_language = settings["currentLanguage"]
    return locales[target_language].get(text, text)


# 全局存储异步工具状态
async_tools = {}
async_tools_lock = asyncio.Lock()

async def execute_tool(tool_id: str, tool_name: str, args: dict, settings: dict,user_prompt: str):
    try:
        results = await dispatch_tool(tool_name, args, settings)
        if isinstance(results, AsyncIterator):
            buffer = []
            async for chunk in results:
                buffer.append(chunk)
            results = "".join(buffer)
                
        if tool_name in ["query_knowledge_base"] and type(results) == list:
            from py.know_base import rerank_knowledge_base
            if settings["KBSettings"]["is_rerank"]:
                results = await rerank_knowledge_base(user_prompt,results)
            results = json.dumps(results, ensure_ascii=False, indent=4)
        async with async_tools_lock:
            async_tools[tool_id] = {
                "status": "completed",
                "result": results,
                "name": tool_name,
                "parameters": args,
            }
    except Exception as e:
        async with async_tools_lock:
            async_tools[tool_id] = {
                "status": "error",
                "result": str(e),
                "name": tool_name,
                "parameters": args,
            }

async def get_image_content(image_url: str) -> str:
    import hashlib
    settings = await load_settings()
    base64_image = await get_image_base64(image_url)
    media_type = await get_image_media_type(image_url)
    url= f"data:{media_type};base64,{base64_image}"
    image_hash = hashlib.md5(image_url.encode()).hexdigest()
    content = ""
    if settings['vision']['enabled']:
        # 如果uploaded_files/{item['image_url']['hash']}.txt存在，则读取文件内容，否则调用vision api
        if os.path.exists(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt")):
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "r", encoding='utf-8') as f:
                content += f"\n\n图片(URL:{image_url} 哈希值：{image_hash})信息如下：\n\n"+str(f.read())+"\n\n"
        else:
            images_content = [{"type": "text", "text": "请仔细描述图片中的内容，包含图片中可能存在的文字、数字、颜色、形状、大小、位置、人物、物体、场景等信息。"},{"type": "image_url", "image_url": {"url": url}}]
            client = AsyncOpenAI(api_key=settings['vision']['api_key'],base_url=settings['vision']['base_url'])
            
            extra = {}

            if settings['vision']['temperature'] !=1:
                extra['temperature'] = settings['vision']['temperature']
            
            response = await client.chat.completions.create(
                model=settings['vision']['model'],
                messages = [{"role": "user", "content": images_content}],
                **extra
            )
            content = f"\n\nn图片(URL:{image_url} 哈希值：{image_hash})信息如下：\n\n"+str(response.choices[0].message.content)+"\n\n"
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "w", encoding='utf-8') as f:
                f.write(str(response.choices[0].message.content))
    else:           
        # 如果uploaded_files/{item['image_url']['hash']}.txt存在，则读取文件内容，否则调用vision api
        if os.path.exists(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt")):
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "r", encoding='utf-8') as f:
                content += f"\n\nn图片(URL:{image_url} 哈希值：{image_hash})信息如下：\n\n"+str(f.read())+"\n\n"
        else:
            images_content = [{"type": "text", "text": "请仔细描述图片中的内容，包含图片中可能存在的文字、数字、颜色、形状、大小、位置、人物、物体、场景等信息。"},{"type": "image_url", "image_url": {"url": url}}]
            client = AsyncOpenAI(api_key=settings['api_key'],base_url=settings['base_url'])
            
            extra = {}

            if settings['temperature'] !=1:
                extra['temperature'] = settings['temperature']
            
            response = await client.chat.completions.create(
                model=settings['model'],
                messages = [{"role": "user", "content": images_content}],
                **extra
            )
            content = f"\n\nn图片(URL:{image_url} 哈希值：{image_hash})信息如下：\n\n"+str(response.choices[0].message.content)+"\n\n"
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "w", encoding='utf-8') as f:
                f.write(str(response.choices[0].message.content))
    return content

# 存储等待中的MCP调用结果
mcp_call_results: Dict[str, asyncio.Future] = {}

async def call_node_extension_tool(ext_id: str, tool_name: str, tool_params: dict) -> str:
    """通过WebSocket调用Node扩展的工具"""
    import uuid
    
    call_id = str(uuid.uuid4())
    future = asyncio.Future()
    mcp_call_results[call_id] = future
    
    # 广播给所有连接，找到对应的扩展
    await ws_manager.broadcast({
        "type": "call_mcp_tool",
        "data": {
            "ext_id": ext_id,
            "tool_name": tool_name,
            "tool_params": tool_params,
            "call_id": call_id
        }
    })
    
    try:
        # 等待结果，超时30秒
        result = await asyncio.wait_for(future, timeout=30.0)
        return str(result)
    except asyncio.TimeoutError:
        return f"调用扩展 {ext_id} 的工具 {tool_name} 超时"
    finally:
        if call_id in mcp_call_results:
            del mcp_call_results[call_id]

async def dispatch_tool(tool_name: str, tool_params: dict, settings: dict,is_sub_agent:bool=False,force_allow: bool = False) -> str | List | AsyncIterator[str] | None :
    global mcp_client_list,_TOOL_HOOKS,HA_client,ChromeMCP_client,sql_client, node_ext_mcp_clients, node_ext_mcp_tools
    print("dispatch_tool",tool_name,tool_params)
    
    from py.utility_tools import time
    # ==================== 1. 定义工具映射表 ====================
    _TOOL_HOOKS = {
        "searxng": searxng,
        "Tavily_search": Tavily_search,
        "query_knowledge_base": query_knowledge_base,
        "jina_crawler": jina_crawler,
        "Crawl4Ai_search": Crawl4Ai_search,
        "firecrawl_search": firecrawl_search,
        "simple_fetch":simple_fetch,
        "markdown_new":markdown_new,
        "agent_tool_call": agent_tool_call,
        "a2a_tool_call": a2a_tool_call,
        "custom_llm_tool": custom_llm_tool,
        "get_file_content":get_file_content,
        "get_image_content": get_image_content,
        "e2b_code": e2b_code,
        "local_run_code": local_run_code,
        "openai_image": openai_image,
        "openai_chat_image":openai_chat_image,
        "Google_search": Google_search,
        "Brave_search": Brave_search,
        "Exa_search": Exa_search,
        "Serper_search": Serper_search,
        "bochaai_search": bochaai_search,
        "comfyui_tool_call": comfyui_tool_call,
        "time": time,
        "get_weather": get_weather,
        "get_location_coordinates": get_location_coordinates,
        "get_weather_by_city":get_weather_by_city,
        "get_wikipedia_summary_and_sections": get_wikipedia_summary_and_sections,
        "get_wikipedia_section_content": get_wikipedia_section_content,
        "search_arxiv_papers": search_arxiv_papers,
        "auto_behavior": auto_behavior,
        "query_diary": handle_query_diary,
        "list_diary_books": handle_list_diary_books,
        "list_pages": list_pages,
        "new_page": new_page,
        "close_page": close_page,
        "select_page": select_page,
        "navigate_page": navigate_page,
        "take_snapshot": take_snapshot,
        "click": click,
        "fill": fill,
        "evaluate_script": evaluate_script,
        "take_screenshot": take_screenshot,
        "hover": hover,
        "press_key": press_key,
        "wait_for": wait_for,
        "fill_form":fill_form,
        "drag": drag,
        "handle_dialog": handle_dialog,
        
        # Docker Sandbox 相关工具（原有）
        "docker_sandbox": docker_sandbox,
        "list_files_tool": list_files_tool,
        "read_file_tool": read_file_tool,
        "read_file_range_tool": read_file_range_tool, # <--- 映射新工具
        "tail_file_tool": tail_file_tool,             # <--- 映射新工具
        "search_files_tool": search_files_tool,
        "edit_file_tool": edit_file_tool,
        "edit_file_string_tool": edit_file_string_tool,
        "glob_files_tool": glob_files_tool,
        "todo_write_tool": todo_write_tool,
        "list_processes_tool": list_processes_tool,
        "get_process_logs_tool": get_process_logs_tool,
        "kill_process_tool": kill_process_tool,
        "docker_manage_ports_tool": docker_manage_ports_tool,
        "read_skill_tool": read_skill_tool,
        
        # 本地环境工具（新增）- 与 Docker 版本功能相同但操作本地文件系统
        "shell_tool_local": shell_tool_local,                     # 本地 bash 执行
        "list_files_tool_local": list_files_tool_local,         # 本地文件列表
        "read_file_tool_local": read_file_tool_local,           # 本地文件读取
        "read_file_range_tool_local": read_file_range_tool_local, # <--- 映射新工具
        "tail_file_tool_local": tail_file_tool_local,             # <--- 映射新工具
        "search_files_tool_local": search_files_tool_local,     # 本地文件搜索
        "edit_file_tool_local": edit_file_tool_local,           # 本地文件写入
        "edit_file_string_tool_local": edit_file_string_tool_local,  # 本地字符串替换
        "glob_files_tool_local": glob_files_tool_local,         # 本地 glob 查找
        "todo_write_tool_local": todo_write_tool_local,         # 本地任务管理
        "local_net_tool": local_net_tool,                       # 本地网络工具
        "send_process_input_tool":send_process_input_tool,       # 本地进程输入工具
        "read_skill_tool_local": read_skill_tool_local,         # 本地技能读取

        # 任务中心工具（新增）
        "create_subtask": create_subtask,
        "query_task_progress": query_task_progress,
        "cancel_subtask": cancel_subtask,
        "finish_task":finish_task,
        "finish_main_task":finish_main_task,

        # 鼠标键盘控制
        "mouse_move":mouse_move,
        "mouse_click":mouse_click,
        "mouse_double_click":mouse_double_click,
        "mouse_drag":mouse_drag,
        "mouse_scroll":mouse_scroll,
        "mouse_hold":mouse_hold,
        "copy_to_input_box":copy_to_input_box,
        "keyboard_press":keyboard_press,
        "keyboard_sequence":keyboard_sequence,
        "keyboard_hotkey":keyboard_hotkey,
        "keyboard_hold":keyboard_hold,
        "logical_type":logical_type,
        "wait":wait,
        "screenshot":screenshot,
        "logical_click":logical_click,

        "update_workspace_settings":update_workspace_settings,
        "acpx_agent":acpx_agent,
    }

    if not _is_steam_build:
        _TOOL_HOOKS["DDGsearch"] = DDGsearch
        _TOOL_HOOKS["pollinations_image"] = pollinations_image
    
    # ==================== 3. 权限拦截逻辑 (Human-in-the-loop) ====================
    # 定义受控的敏感工具列表
    # 这些工具在执行前需要检查权限配置 (.agents/config.json 或 全局设置)
    SENSITIVE_TOOLS = [
        "docker_sandbox",
        "edit_file_tool",
        "edit_file_string_tool",
        "shell_tool_local",
        "edit_file_tool_local",
        "edit_file_string_tool_local",
        "list_processes_tool",
        "get_process_logs_tool",
        "kill_process_tool",
        "docker_manage_ports_tool",
        "local_net_tool",
        "send_process_input_tool",
    ]
    
    # 只有当调用的工具属于敏感工具列表时才进行拦截检查
    if tool_name in SENSITIVE_TOOLS and not force_allow: # 如果不是强制允许，则进行权限检查
        
        # 获取相关配置
        cli_settings = settings.get("CLISettings", {})
        cwd = cli_settings.get("cc_path")
        # 修复：local 环境应该从 localEnvSettings 读取权限模式
        engine = cli_settings.get("engine", "")
        
        if engine == "local":
            env_settings = settings.get("localEnvSettings", {})
        elif engine == "ds":
            env_settings = settings.get("dsSettings", {})
        else:
            env_settings = settings.get("acpSettings", {})
        
        permission_mode = env_settings.get("permissionMode", "default")
        
        is_allowed = False

        # --- 规则 A: 全局 YOLO 模式 (Bypass Permissions) ---
        if permission_mode == "yolo" or permission_mode == "cowork" or permission_mode == "goal":
            is_allowed = True
            
        # --- 规则 B: 自动批准模式 (Accept Edits) ---
        # 允许文件编辑类工具（包括全量写入、精确替换、任务管理）
        # 但依然拦截终端命令（docker/bash）
        elif permission_mode == "auto-approve":
            if tool_name in ["edit_file_tool", "edit_file_string_tool", "todo_write_tool", "edit_file_tool_local", "edit_file_string_tool_local", "todo_write_tool_local"]:
                is_allowed = True
            # docker/bash 等危险命令在此模式下依然默认拦截，除非在项目白名单中
        
        # --- 规则 C: 默认模式 (Default) ---
        # 默认全部拦截
        
        # --- 规则 D: 项目级白名单覆盖 (Project Config Override) ---
        # 如果以上规则未通过，检查 .agents/config.json
        # 如果用户之前点击过 "Allow Always"，这里会返回 True
        if not is_allowed and cwd:
            if is_tool_allowed_by_project_config(cwd, tool_name):
                is_allowed = True
                print(f"[Permission] Tool '{tool_name}' allowed by project config.")


        # --- 规则 E: 如果是子智能体，且不被允许，直接返回拒绝 ---
        if not is_allowed and is_sub_agent:
            return "permission_denied"
        
        # --- 最终判定 ---
        if not is_allowed:
            # 返回前端特定的 JSON 结构，触发审批 UI
            print(f"[Permission] Blocked '{tool_name}', requesting approval.")
            return json.dumps({
                "type": "approval_required",
                "tool_name": tool_name,
                "tool_params": tool_params,
                "permission_mode": permission_mode,
                "cwd": cwd
            }, ensure_ascii=False)

    # ==================== 4. 常规工具处理逻辑 (原有代码) ====================

    if "multi_tool_use." in tool_name:
        tool_name = tool_name.replace("multi_tool_use.", "")
        
    if "custom_http_" in tool_name:
        tool_name = tool_name.replace("custom_http_", "")
        print(tool_name)
        settings_custom_http = settings['custom_http']
        for custom in settings_custom_http:
            if custom['name'] == tool_name:
                tool_custom_http = custom
                break
        method = tool_custom_http['method']
        url = tool_custom_http['url']
        headers = tool_custom_http['headers']
        result = await fetch_custom_http(method, url, headers, tool_params)
        return str(result)
        
    if "comfyui_" in tool_name:
        tool_name = tool_name.replace("comfyui_", "")
        text_input = tool_params.get('text_input', None)
        text_input_2 = tool_params.get('text_input_2', None)
        image_input = tool_params.get('image_input', None)
        image_input_2 = tool_params.get('image_input_2', None)
        print(tool_name)
        result = await comfyui_tool_call(tool_name, text_input, image_input,text_input_2,image_input_2)
        return str(result)
        
    if settings["HASettings"]["enabled"]:
        ha_tool_list = HA_client._tools
        if tool_name in ha_tool_list:
            result = await HA_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
        Chrome_tool_list = ChromeMCP_client._tools
        if tool_name in Chrome_tool_list:
            result = await ChromeMCP_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    if settings["sqlSettings"]["enabled"]:
        sql_tool_list = sql_client._tools
        if tool_name in sql_tool_list:
            result = await sql_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    # ==================== 5. 任务中心工具特殊处理 ====================
    if tool_name in ["create_subtask", "query_task_progress", "cancel_subtask", "finish_task", "finish_main_task"]:
        cli_settings = settings.get("CLISettings", {})
        cwd = cli_settings.get("cc_path")
        
        if tool_name == "create_subtask":
            # 读取共识文件（如果存在）
            from pathlib import Path
            import aiofiles
            
            consensus_content = None
            consensus_file = Path(cwd) / ".agents" / "consensus.md"
            if consensus_file.exists():
                async with aiofiles.open(consensus_file, 'r', encoding='utf-8') as f:
                    consensus_content = await f.read()
            
            result = await create_subtask(
                workspace_dir=cwd,
                settings=settings, 
                consensus_content=consensus_content,
                **tool_params  # 这行是关键：它会把 AI 传的 title, platforms 等全部解包传入
            )
            return result

        
        elif tool_name == "query_task_progress":
            result = await query_task_progress(
                workspace_dir=cwd,
                **tool_params
            )
            return result
        
        elif tool_name == "cancel_subtask":
            result = await cancel_subtask(
                workspace_dir=cwd,
                task_id=tool_params.get("task_id")
            )
            return result
        elif tool_name == "finish_task":
            result = await finish_task(
                workspace_dir=cwd,
                task_id=tool_params.get("task_id"),
                result=tool_params.get("result"),
            )
            return result
        elif tool_name == "finish_main_task":
            result = await finish_main_task(
                result=tool_params.get("result", ""),
            )
            return result

    if tool_name not in _TOOL_HOOKS:
        # 1. 先查询常规的 MCP 客户端
        for server_name, mcp_client in mcp_client_list.items():
            if hasattr(mcp_client, '_conn') and mcp_client._conn and tool_name in mcp_client._conn.tools:
                result = await mcp_client.call_tool(tool_name, tool_params)
                if isinstance(result, str):
                    return result
                elif hasattr(result, 'model_dump'):
                    return str(result.model_dump())
                else:
                    return str(result)
        
        # 2. 🔥 查询 Node 扩展的 MCP 工具
        for ext_id, tools in node_ext_mcp_tools.items():
            for tool in tools:
                if tool['name'] == tool_name:
                    # 找到对应的扩展，通过WebSocket调用
                    return await call_node_extension_tool(ext_id, tool_name, tool_params)
        
        return None
        
    tool_call = _TOOL_HOOKS[tool_name]
    try:
        if tool_name in ("acpx_agent", "shell_tool_local", "docker_sandbox"):
            return tool_call(**tool_params)

        ret_out = await tool_call(**tool_params)
        if tool_name == "auto_behavior":
            settings = ret_out
            await ws_manager.broadcast_settings_update(settings)
            ret_out = "任务设置成功！"
        return ret_out
    except Exception as e:
        logger.error(f"Error calling tool {tool_name}: {e}")
        return f"Error calling tool {tool_name}: {e}"

def process_extra_params(extra_params_list):
    extra_body = {}
    for item in extra_params_list:
        name = item.get('name', '').strip()
        if not name:
            continue
            
        value = item.get('value')
        p_type = item.get('type')

        try:
            if p_type == 'json':  # 合并后的判断
                if isinstance(value, str):
                    extra_body[name] = json.loads(value) if value.strip() else {}
                else:
                    extra_body[name] = value
            elif p_type == 'integer':
                extra_body[name] = int(value)
            elif p_type == 'float':
                extra_body[name] = float(value)
            elif p_type == 'boolean':
                extra_body[name] = bool(value)
            else:
                extra_body[name] = str(value)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing param {name}: {e}")
            extra_body[name] = value 

    return extra_body

class ChatRequest(BaseModel):
    messages: List[Dict]
    model: str = None
    tools: dict = None
    stream: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: float = 1
    fileLinks: List[str] = None
    enable_thinking: bool = False
    enable_deep_research: bool = False
    enable_web_search: bool = False
    asyncToolsID: List[str] = None
    reasoning_effort: str = None
    is_app_bot: bool = False
    platform: str = None
    is_sub_agent: bool = False
    enable_tools : List[str] = None
    disable_tools: List[str] = None
    conversation_id: Optional[Union[str, int, float]] = None
    group_id: Optional[Union[str, int, float]] = None
    user_message_id: Optional[Union[str, int, float]] = None

GROUP_MEMORY_TYPES = {"fact", "decision", "preference", "todo", "constraint", "glossary"}
GROUP_MEMORY_DONE_HINTS = ("完成", "已完成", "done", "resolved", "fixed", "closed")

def _extract_text_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
        return "\n".join(filter(None, texts))
    return ""

def _memory_tokens(text: str) -> set[str]:
    if not text:
        return set()
    tokens = re.findall(r'[\u4e00-\u9fff]{1,6}|[a-zA-Z0-9_]{2,}', text.lower())
    return set(tokens)

def _normalize_memory_text(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip().lower())

def _normalize_entity_id(value: Optional[Union[str, int, float]]) -> str:
    if value is None:
        return ""
    return str(value).strip()

def _merge_group_memories(*memory_lists: list[dict]) -> list[dict]:
    merged: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for memory_list in memory_lists:
        for item in memory_list or []:
            if not isinstance(item, dict):
                continue
            memory_type = str(item.get("memory_type", "")).strip().lower()
            summary = str(item.get("summary", "")).strip()
            content = str(item.get("content", "")).strip()
            if memory_type not in GROUP_MEMORY_TYPES or not summary or not content:
                continue
            dedupe_key = (
                memory_type,
                _normalize_memory_text(summary),
                _normalize_memory_text(content),
            )
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append({
                "memory_type": memory_type,
                "summary": summary,
                "content": content,
                "importance": max(0.0, min(1.0, float(item.get("importance", 0.5) or 0.5))),
            })
    return merged

async def _load_group_map() -> dict:
    covs = await load_covs()
    groups = covs.get("conversationGroups", []) or []
    group_map = {"default": {"id": "default", "name": "Ungrouped", "memoryConfig": {}}}
    for group in groups:
        if group and group.get("id"):
            group_map[group["id"]] = group
    return group_map

async def _fetch_group_memories(group_id: str, query_text: str, top_k: int = 6) -> list[dict]:
    if not group_id:
        return []
    query_tokens = _memory_tokens(query_text)
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM group_memory
            WHERE group_id = ? AND status = 'active'
            ORDER BY updated_at DESC
            """,
            (group_id,),
        ) as cursor:
            rows = [dict(row) for row in await cursor.fetchall()]

    def score_memory(item: dict) -> float:
        text = f"{item.get('summary', '')}\n{item.get('content', '')}"
        overlap = len(query_tokens & _memory_tokens(text))
        importance = float(item.get("importance") or 0)
        recency = float(item.get("updated_at") or 0) / 1_000_000_000_000
        return overlap * 5 + importance * 2 + recency

    ranked = sorted(rows, key=score_memory, reverse=True)
    selected = ranked[:top_k]
    if selected:
        now_ts = int(time.time() * 1000)
        import aiosqlite
        async with aiosqlite.connect(COVS_PATH) as db:
            await db.executemany(
                "UPDATE group_memory SET last_used_at = ? WHERE id = ?",
                [(now_ts, item["id"]) for item in selected],
            )
            await db.commit()
    return selected

def _build_group_memory_prompt(group: dict, memories: list[dict]) -> str:
    if not memories:
        return ""
    header = [
        f"当前对话分组: {group.get('name') or group.get('id')}",
        "以下是仅限当前分组可用的长期记忆，请只在相关时使用，不要臆测或扩展未确认的信息。",
        "如果记忆中包含具体值，请优先直接复述具体值，不要用“见记忆条目”或占位说明代替：",
    ]
    lines = []
    for idx, memory in enumerate(memories, 1):
        summary = str(memory.get('summary') or '').strip()
        content = str(memory.get('content') or '').strip()
        memory_type = memory.get('memory_type', 'fact')
        if summary and content and summary != content:
            lines.append(f"{idx}. [{memory_type}] 摘要: {summary}")
            lines.append(f"   具体内容: {content}")
        else:
            lines.append(f"{idx}. [{memory_type}] {content or summary}")
    return "\n".join(header + lines)

def _trim_request_messages(messages: List[Dict], recent_count: int = 12) -> List[Dict]:
    system_messages = [copy.deepcopy(m) for m in messages if m.get("role") == "system"]
    dialog_messages = [copy.deepcopy(m) for m in messages if m.get("role") != "system"]
    return system_messages + dialog_messages[-recent_count:]

async def _apply_group_memory_context(request: ChatRequest) -> dict:
    request.conversation_id = _normalize_entity_id(request.conversation_id) or None
    request.user_message_id = _normalize_entity_id(request.user_message_id) or None
    request.group_id = _normalize_entity_id(request.group_id) or "default"
    group_id = request.group_id or "default"
    if not group_id or group_id == "default":
        request.messages = _trim_request_messages(request.messages)
        return {"enabled": False, "group_id": group_id}

    group_map = await _load_group_map()
    group = group_map.get(group_id)
    memory_enabled = bool(group and (group.get("memoryConfig") or {}).get("enabled"))

    request.messages = _trim_request_messages(request.messages)
    if not memory_enabled:
        return {"enabled": False, "group_id": group_id, "group": group}

    last_user_text = ""
    for msg in reversed(request.messages):
        if msg.get("role") == "user":
            last_user_text = _extract_text_content(msg.get("content"))
            break

    memories = await _fetch_group_memories(group_id, last_user_text, top_k=6)
    memory_prompt = _build_group_memory_prompt(group or {"id": group_id, "name": group_id}, memories)
    if memory_prompt:
        content_append(request.messages,'system',memory_prompt)
    return {"enabled": memory_enabled, "group_id": group_id, "group": group, "memories": memories}

async def _extract_group_memories(client, settings: dict, payload: dict) -> list[dict]:
    user_message = (payload.get("user_message") or "").strip()
    assistant_message = (payload.get("assistant_message") or "").strip()
    if not user_message or not assistant_message:
        return []

    extraction_prompt = (
        "你是一个结构化记忆提取器。只提取后续同组对话可复用的长期信息，"
        "不要总结整段聊天，不要保留闲聊、猜测、情绪宣泄、不确定信息和重复信息。"
        "只允许 memory_type 为 fact、decision、preference、todo、constraint、glossary。"
        "返回 JSON 数组，每项字段必须包含 memory_type、content、summary、importance。"
        "importance 取 0 到 1。若没有可提取记忆，返回 []。"
    )

    example_input = f"用户消息:\n{user_message}\n\n助手回复:\n{assistant_message}"

    def fallback_memories() -> list[dict]:
        combined = f"{user_message}\n{assistant_message}"
        results = []
        if any(keyword in combined.lower() for keyword in ["决定", "采用", "使用", "choose", "decide", "use "]):
            results.append({
                "memory_type": "decision",
                "summary": assistant_message[:120] or user_message[:120],
                "content": assistant_message or user_message,
                "importance": 0.82,
            })
        if any(keyword in combined.lower() for keyword in ["偏好", "喜欢", "prefer", "preferred"]):
            results.append({
                "memory_type": "preference",
                "summary": user_message[:120],
                "content": user_message,
                "importance": 0.72,
            })
        if any(keyword in combined.lower() for keyword in ["限制", "必须", "不能", "constraint", "must", "cannot", "can't"]):
            results.append({
                "memory_type": "constraint",
                "summary": (user_message or assistant_message)[:120],
                "content": user_message or assistant_message,
                "importance": 0.78,
            })
        if any(keyword in combined.lower() for keyword in ["todo", "待办", "后续", "需要", "next"]):
            results.append({
                "memory_type": "todo",
                "summary": user_message[:120],
                "content": user_message,
                "importance": 0.68,
            })
        return _merge_group_memories(results)

    try:
        extra_params = settings.get('extra_params') or []
        extra_body = process_extra_params(extra_params)
        response = await client.chat.completions.create(
            model=settings['model'],
            messages=[
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": example_input},
            ],
            temperature=0.1,
            stream=False,
            extra_body=extra_body,
        )
        content = response.choices[0].message.content or "[]"
        if "```json" in content:
            match = re.search(r'```json(.*?)```', content, re.DOTALL)
            content = match.group(1) if match else content.replace("```json", "").replace("```", "")
        data = json.loads(content)
    except Exception as e:
        logger.warning(f"Group memory extraction failed: {e}")
        return fallback_memories()

    if not isinstance(data, list):
        return []

    cleaned = []
    for item in data:
        if not isinstance(item, dict):
            continue
        memory_type = str(item.get("memory_type", "")).strip().lower()
        summary = str(item.get("summary", "")).strip()
        content = str(item.get("content", "")).strip()
        importance = float(item.get("importance", 0.5) or 0.5)
        if memory_type not in GROUP_MEMORY_TYPES or not summary or not content:
            continue
        cleaned.append({
            "memory_type": memory_type,
            "summary": summary,
            "content": content,
            "importance": max(0.0, min(1.0, importance)),
        })
    return _merge_group_memories(cleaned) or fallback_memories()

async def _upsert_group_memories(group_id: str, source_chat_id: str, source_message_id: str, memories: list[dict]) -> None:
    if not group_id or not source_chat_id or not memories:
        return
    now_ts = int(time.time() * 1000)
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        db.row_factory = aiosqlite.Row
        for memory in memories:
            normalized_summary = _normalize_memory_text(memory["summary"])
            normalized_content = _normalize_memory_text(memory["content"])
            async with db.execute(
                """
                SELECT * FROM group_memory
                WHERE group_id = ? AND memory_type = ? AND status = 'active'
                """,
                (group_id, memory["memory_type"]),
            ) as cursor:
                existing_rows = [dict(row) for row in await cursor.fetchall()]

            duplicate = None
            superseded_ids = []
            for row in existing_rows:
                row_summary = _normalize_memory_text(row.get("summary"))
                row_content = _normalize_memory_text(row.get("content"))
                if row_summary == normalized_summary or row_content == normalized_content:
                    duplicate = row
                    break
                if (
                    memory["memory_type"] in {"decision", "preference", "constraint", "todo"}
                    and (normalized_summary in row_summary or row_summary in normalized_summary)
                ):
                    superseded_ids.append(row["id"])

            if memory["memory_type"] == "todo" and any(hint in normalized_content for hint in GROUP_MEMORY_DONE_HINTS):
                superseded_ids.extend([row["id"] for row in existing_rows if row["memory_type"] == "todo"])
                continue

            if duplicate:
                await db.execute(
                    """
                    UPDATE group_memory
                    SET importance = MAX(importance, ?), updated_at = ?, last_used_at = ?
                    WHERE id = ?
                    """,
                    (memory["importance"], now_ts, now_ts, duplicate["id"]),
                )
                continue

            if superseded_ids:
                await db.executemany(
                    "UPDATE group_memory SET status = 'superseded', updated_at = ? WHERE id = ?",
                    [(now_ts, item_id) for item_id in superseded_ids],
                )

            await db.execute(
                """
                INSERT INTO group_memory (
                    id, group_id, source_chat_id, source_message_id, memory_type, content, summary,
                    importance, status, version, created_at, updated_at, last_used_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    group_id,
                    source_chat_id,
                    source_message_id,
                    memory["memory_type"],
                    memory["content"],
                    memory["summary"],
                    memory["importance"],
                    now_ts,
                    now_ts,
                    now_ts,
                    json.dumps({"normalized_summary": normalized_summary}, ensure_ascii=False),
                ),
            )
        await db.commit()

async def _invalidate_group_memories_by_chat(source_chat_id: str) -> None:
    if not source_chat_id:
        return
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory WHERE source_chat_id = ?",
            (source_chat_id,),
        )
        await db.commit()

async def _invalidate_group_memories_by_group(group_id: str) -> None:
    if not group_id:
        return
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory WHERE group_id = ?",
            (group_id,),
        )
        await db.commit()

async def _invalidate_all_group_memories() -> None:
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory",
        )
        await db.commit()

async def message_without_images(messages: List[Dict]) -> List[Dict]:
    if messages:
        for message in messages:
            if 'content' in message:
                if isinstance(message['content'], list):
                    for item in message['content']:
                        # 剥离包含图像和视频的内容，只保留文本传递（用于快速生成请求或剥离富媒体阶段）
                        if isinstance(item, dict) and item.get('type') == 'text':
                            message['content'] = item['text']
                            break
    return messages

async def images_in_messages(messages: List[Dict], fastapi_base_url: str) -> List[Dict]:
    media_items = []
    index = 0
    for message in messages:
        extracted_media =[]
        if 'content' in message:
            if isinstance(message['content'], list):
                for item in message['content']:
                    # 动态捕获图片或视频
                    if isinstance(item, dict) and item.get('type') in ['image_url', 'video_url']:
                        media_key = item['type']  # 'image_url' 或 'video_url'
                        
                        if item[media_key]["url"].startswith("http"):
                            media_url = item[media_key]["url"]
                            if fastapi_base_url in media_url:
                                media_url = media_url.replace(fastapi_base_url, f"http://127.0.0.1:{PORT}/")
                            
                            # 假设你的 get_image_base64 同样可以将视频流转为 Base64
                            base64_data = await get_image_base64(media_url)
                            # 假设 get_image_media_type 也能正常返回 video/mp4, video/webm 等
                            mime_type = await get_image_media_type(media_url)
                            
                            item[media_key]["url"] = f"data:{mime_type};base64,{base64_data}"
                            item[media_key]["hash"] = hashlib.md5(item[media_key]["url"].encode()).hexdigest()
                        else:
                            item[media_key]["hash"] = hashlib.md5(item[media_key]["url"].encode()).hexdigest()

                        extracted_media.append(item)
        if extracted_media:
            # 保持原来的字典结构向下兼容，images 实际上装载了 media
            media_items.append({'index': index, 'images': extracted_media})
        index += 1
    return media_items

async def images_add_in_messages(request_messages: List[Dict], images: List[Dict], settings: dict) -> List[Dict]:
    messages = copy.deepcopy(request_messages)
    
    if settings['vision']['enabled']:
        for image in images:
            index = image['index']
            if index < len(messages):
                if 'content' in messages[index]:
                    for item in image['images']:
                        media_key = item['type']  # 'image_url' 或 'video_url'
                        file_hash = item[media_key]['hash']
                        media_name = "视频" if media_key == "video_url" else "图片"
                        
                        # 统一缓存处理，如果是视频就是视频文本解析记录
                        cache_file = os.path.join(UPLOAD_FILES_DIR, f"{file_hash}.txt")
                        if os.path.exists(cache_file):
                            with open(cache_file, "r", encoding='utf-8') as f:
                                messages[index]['content'] += f"\n\nsystem: 用户发送的{media_name}(哈希值：{file_hash})信息如下：\n\n{f.read()}\n\n"
                        else:
                            # 根据输入类型调整提示词
                            prompt_text = "请仔细描述这段视频中的内容，包含视频中发生的事件、场景变化、人物动作以及关键细节等信息。" if media_key == "video_url" else "请仔细描述图片中的内容，包含图片中可能存在的文字、数字、颜色、形状、大小、位置、人物、物体、场景等信息。"
                            
                            media_content =[
                                {"type": "text", "text": prompt_text},
                                {"type": media_key, media_key: {"url": item[media_key]['url']}}
                            ]
                            
                            # 直接交给视觉模型（视觉模型需原生支持视频）
                            client = AsyncOpenAI(api_key=settings['vision']['api_key'], base_url=settings['vision']['base_url'])
                            
                            extra = {}

                            if settings['vision']['temperature'] !=1:
                                extra['temperature'] = settings['vision']['temperature']

                            response = await client.chat.completions.create(
                                model=settings['vision']['model'],
                                messages=[{"role": "user", "content": media_content}],
                                **extra
                            )
                            result_text = str(response.choices[0].message.content)
                            messages[index]['content'] += f"\n\nsystem: 用户发送的{media_name}(哈希值：{file_hash})信息如下：\n\n{result_text}\n\n"
                            
                            with open(cache_file, "w", encoding='utf-8') as f:
                                f.write(result_text)
    else:           
        for image in images:
            index = image['index']
            if index < len(messages):
                if 'content' in messages[index]:
                    for item in image['images']:
                        media_key = item['type']  # 'image_url' 或 'video_url'
                        file_hash = item[media_key]['hash']
                        media_name = "视频" if media_key == "video_url" else "图片"
                        
                        cache_file = os.path.join(UPLOAD_FILES_DIR, f"{file_hash}.txt")
                        if os.path.exists(cache_file):
                            with open(cache_file, "r", encoding='utf-8') as f:
                                messages[index]['content'] += f"\n\nsystem: 用户发送的{media_name}(哈希值：{file_hash})信息如下：\n\n{f.read()}\n\n"
                        else:
                            if isinstance(messages[index]['content'], str):
                                messages[index]['content'] =[{"type": "text", "text": messages[index]['content']}]
                            
                            # 未开启视觉模型，直接以原生的 `video_url` 或 `image_url` 拼入请求，让当前大模型自行读取理解
                            messages[index]['content'].append({"type": media_key, media_key: {"url": item[media_key]['url']}})
                            
    return messages

async def read_todos_local(cwd: str) -> list:
    """读取本地待办事项（跨平台）"""
    todo_file = Path(cwd) / ".agents" / "ai_todos.json"
    if not todo_file.exists():
        return []
    
    try:
        async with aiofiles.open(todo_file, 'r', encoding='utf-8') as f:
            content = await f.read()
            return json.loads(content) if content else []
    except (json.JSONDecodeError, FileNotFoundError):
        return []
    except Exception as e:
        print(f"Error reading todos: {e}")
        return []

async def read_agents_md(cwd: str) -> str:  # 返回str而不是list
    """读取本地AGENTS.md文件内容"""
    agents_md_path = Path(cwd) / ".agents" / "AGENTS.md"
    
    if not agents_md_path.exists():
        return ""
    
    try:
        async with aiofiles.open(agents_md_path, 'r', encoding='utf-8') as f:
            content = await f.read()
            return content
    except FileNotFoundError:
        # 文件在检查后又被删除的情况
        return ""
    except Exception as e:
        print(f"Error reading AGENTS.md: {e}")
        return ""

def get_system_context() -> str:
    """
    获取当前系统环境的详细描述，帮助 AI 适配正确的命令和路径格式
    """
    system = platform.system()
    release = platform.release()
    
    # 检测 shell
    if system == "Windows":
        shell = "PowerShell"
        path_hint = "使用 Windows 路径格式（C:\\Users\\name\\file），命令使用 dir、copy、del 等"
        command_hint = f"当前使用 {shell}，优先使用 PowerShell cmdlet（如 Get-ChildItem、Get-Content、Remove-Item），也兼容部分 CMD 命令。避免使用 Unix 命令（ls/cat/rm）"
    elif system == "Darwin":
        shell = os.path.basename(os.environ.get('SHELL', '/bin/zsh'))
        path_hint = "使用 Unix 路径格式（/Users/name/file），区分大小写"
        command_hint = f"当前为 macOS ({release})，使用 {shell}。支持标准 Unix 命令（ls/cat/rm），但注意部分命令是 BSD 版本而非 GNU 版本"
    else:  # Linux
        shell = os.path.basename(os.environ.get('SHELL', '/bin/bash'))
        path_hint = "使用 Unix 路径格式（/home/name/file），区分大小写"
        command_hint = f"当前为 Linux ({release})，使用 {shell}。支持标准 GNU 命令和工具链"
    
    return f"""【环境信息】操作系统：{system} {release} | Shell：{shell}

⚠️ 重要提示：
1. {path_hint}
2. {command_hint}
3. 执行 shell_tool_local 时，命令必须符合当前系统的语法规范
4. 路径分隔符：Windows 使用反斜杠(\\)，Unix 使用正斜杠(/)
5. 如果需要使用网络端口，请尽可能选择不常用的端口，避免冲突，例如：10000 以上的端口
6. 请尽量使用相对路径，避免使用绝对路径，以免在跨平台时出现问题
7. 请勿操作工作区以外的文件，以免造成不必要的风险和损失
"""


async def get_project_skills_summary(cwd: str, visibility_scope: str = "workspace") -> str:
    """
    根据可见范围返回项目技能摘要
    
    Args:
        cwd: 当前工作目录
        visibility_scope: 可见范围，可选值: "global", "workspace", "none"
    
    Returns:
        技能摘要字符串
    """
    # 如果可见范围设置为 "none"，直接返回空字符串
    if visibility_scope == "none":
        return ""
    
    # 根据可见范围选择不同的技能目录
    if visibility_scope == "workspace":
        # 工作区技能：从项目目录的 .agents/skills 查找
        skills_root = Path(cwd) / ".agents" / "skills"
        scope_name = "工作区"
    elif visibility_scope == "global":
        # 全局技能：从常量 SKILLS_DIR 查找
        skills_root = Path(SKILLS_DIR)
        scope_name = "全局"
    else:
        # 未知范围，返回空
        return ""
    
    # 检查技能目录是否存在
    if not skills_root.exists() or not skills_root.is_dir():
        return ""

    found_skills_blocks = []
    for skill_dir in sorted(skills_root.iterdir()):
        if skill_dir.is_dir():
            skill_id = skill_dir.name
            doc_file_path = None
            for name in ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]:
                if (skill_dir / name).exists():
                    doc_file_path = skill_dir / name
                    break
            
            yaml_meta = ""
            if doc_file_path:
                try:
                    content = doc_file_path.read_text(encoding='utf-8')
                    if content.startswith("---"):
                        parts = content.split("---", 2)
                        if len(parts) >= 3: 
                            yaml_meta = parts[1].strip()
                except Exception:
                    pass

            skill_info = f"- **{skill_id}**"
            if yaml_meta:
                skill_info += f":\n```yaml\n{yaml_meta}\n```"
            else:
                skill_info += " (可用)"
            found_skills_blocks.append(skill_info)

    if not found_skills_blocks:
        return ""

    # 根据可见范围返回不同的摘要信息
    summary = f"\n\n🛠️ **{scope_name}技能 ({scope_name} Skills)**：\n"
    
    if visibility_scope == "workspace":
        summary += "检测到本项目特有的 Agent 技能定义。这些技能仅在本工作区内可见：\n\n"
    elif visibility_scope == "global":
        summary += "检测到全局 Agent 技能定义。这些技能在所有项目中都可用：\n\n"
    
    summary += "\n".join(found_skills_blocks)
    summary += "\n\n*提示：你可以通过读取skill的工具获取该技能文件夹的文件树和完整说明文档。*"
    
    return summary

async def tools_change_messages(request: ChatRequest, settings: dict):
    global HA_client, ChromeMCP_client, sql_client
    
    if request.messages and request.messages[0]['role'] == 'system' and request.messages[0]['content'] != '':
        basic_message = " "
        request.messages[0]['content'] += basic_message

    cli_settings = settings.get("CLISettings", {})
    cwd = cli_settings.get("cc_path")
    visibilityScope = cli_settings.get("visibilityScope", "workspace")
    engine = cli_settings.get("engine", "")
    
    if engine == "local":
        env_settings = settings.get("localEnvSettings", {})
    elif engine == "ds":
        env_settings = settings.get("dsSettings", {})
    else:
        env_settings = settings.get("acpSettings", {})
    
    permissionMode = env_settings.get("permissionMode", "default")
    
    # ==================== 固定能力 & 规则注入（系统消息，不随轮次变化） ====================
    # 注：原 TTS 用 prepend 会破坏前缀，现改为 append，所有固定规则按频率从低到高（实际均不变）顺序追加

    # 平台信息（固定）
    if request.is_app_bot and request.platform:
        platform_message = f"\n\n用户正在使用 {request.platform} 软件与你交流\n\n"
        content_append(request.messages, 'system', platform_message)

    # 权限模式提示（固定）
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        permission_message = ""
        if permissionMode != "plan" and permissionMode != "cowork" and permissionMode != "goal":
            permission_message = "你当前处于执行模式，你可以自由地使用所有工具，但请注意不要滥用权限！如果有更安全的工具，请不要直接使用bash命令！"
            content_append(request.messages, 'system', permission_message)
        elif permissionMode == "goal":
            if not request.is_sub_agent:
                permission_message += "你当前处于目标完成模式。你拥有最高权限，可以使用所有工具。你可以通过 create_subtask 工具将子任务分派给子智能体并行处理。当你确认用户的主任务已经全部达成时，必须调用 finish_main_task 工具并提供最终执行结果的详细总结来标记任务完成。在调用 finish_main_task 之前不要停止。\n\n"
                content_append(request.messages, 'system', permission_message)
                if request.is_app_bot and request.platform:
                    task_platform_message = f"\n\n使用create_subtask工具时请将platforms参数设置为[{request.platform}]，从而将子任务的结果及时发给用户。\n\n"
                    content_append(request.messages, 'system', task_platform_message)
                else:
                    task_platform_message = f"\n\n使用create_subtask工具时请将platforms参数设置为['chat']，从而将子任务的结果及时发给用户本地客户端。\n\n"
                    content_append(request.messages, 'system', task_platform_message)
            else:
                permission_message = "你当前处于执行模式，你可以自由地使用所有工具，但请注意不要滥用权限！如果有更安全的工具，请不要直接使用bash命令！"
                content_append(request.messages, 'system', permission_message)
        elif permissionMode == "cowork":
            if not request.is_sub_agent:
                permission_message += "你当前处于协作模式，create_subtask工具可以帮你完成几乎任何任务（比如查资料、写代码、生成报告等），当你遇到难题时，可以尝试把它分解成一个个小任务，交给create_subtask工具去完成！当用户再次询问进度时，你可以用query_task_progress工具查询任务进度和获取详细结果\n\n"
                content_append(request.messages, 'system', permission_message)
                if request.is_app_bot and request.platform:
                    task_platform_message = f"\n\n使用create_subtask工具时请将platforms参数设置为[{request.platform}]，从而将子任务的结果及时发给用户。\n\n"
                    content_append(request.messages, 'system', task_platform_message)
                else:
                    task_platform_message = f"\n\n使用create_subtask工具时请将platforms参数设置为['chat']，从而将子任务的结果及时发给用户本地客户端。\n\n"
                    content_append(request.messages, 'system', task_platform_message)
            else:
                permission_message = "你当前处于执行模式，你可以自由地使用所有工具，但请注意不要滥用权限！如果有更安全的工具，请不要直接使用bash命令！"
                content_append(request.messages, 'system', permission_message)
        else:
            permission_message = "你当前处于计划模式，请尽可能只使用只读工具了解当前项目，使用自然语言描述你的需求和计划，并等待用户确认后再执行！"
            content_append(request.messages, 'system', permission_message)

    # Docker 环境固定信息（完全静态）
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine == "ds":
        system_context = """【环境信息】操作系统：Linux | Shell：bash

⚠️ 重要提示：
1. 当前为 Docker 环境，请使用 Linux 命令和工具链
2. 执行 docker_sandbox 时，命令必须符合 Linux 的语法规范
3. 路径分隔符：Unix 使用正斜杠(/)
4. 请尽量使用相对路径，避免使用绝对路径，以免在跨平台时出现问题

### ✅ **已安装的主要开发工具**

#### **编程语言和运行时**
1. **Python**
   - Python
   - pip
   - uv

2. **Node.js**
   - Node.js
   - npm
   - npx

3. **Go**
   - Go

4. **Perl**
   - Perl

#### **版本控制和协作工具**
1. **Git**
   - git
   - GitHub CLI (gh)

#### **包管理和构建工具**
1. **Python 包管理**
   - pip / pip3
   - uv

2. **Node.js 包管理**
   - npm / npx

3. **系统包管理**
   - apt-get / dpkg

#### **文本处理和命令行工具**
1. **文本处理**
   - jq
   - awk / sed / grep
   - cat / less / more / head / tail

2. **文件操作**
   - tar / unzip
   - rsync
   - 所有基本 Unix 命令（ls, cp, mv, rm, mkdir, chmod 等）

3. **系统工具**
   - bash shell
   - make
   - which / whereis

#### **网络工具**
1. **HTTP 客户端**
   - curl

2. **安全工具**
   - openssl
   - gpg

#### **系统监控**
1. **进程和资源监控**
   - top / ps
   - free / df / du
   
"""
        content_append(request.messages, 'system', system_context)

    # 自主行为说明（固定）
    if request.messages[-1]['role'] == 'system' and settings['tools']['autoBehavior']['enabled'] and not request.is_app_bot and not request.is_sub_agent:
        language_message = f"\n\n当你看到被插入到对话之间的系统消息，这是自主行为系统向你发送的消息，例如用户主动或者要求你设置了一些定时任务或者延时任务，当你看到自主行为系统向你发送的消息时，说明这些任务到了需要被执行的节点，例如：用户要你三点或五分钟后提醒开会的事情，然后当你看到一个被插入的“提醒用户开会”的系统消息，你需要立刻提醒用户开会，以此类推\n\n"
        content_append(request.messages, 'system', language_message)

    # 桌面截图提示（固定）
    if settings['vision']['desktopVision'] and not request.is_app_bot and not request.is_sub_agent:
        desktop_message = "\n\n用户与你对话时，如果发了图片给你，有可能是给你发当前的桌面截图。\n\n"
        content_append(request.messages, 'system', desktop_message)

    # 推理提示（固定，保留原逻辑 prepend 到用户消息，因其为固定前缀不会破坏缓存）
    if settings['tools']['inference']['enabled']:
        inference_message = "回答用户前请先思考推理，再回答问题，你的思考推理的过程必须放在<think>与</think>之间。\n\n"
        content_prepend(request.messages, 'user', f"{inference_message}\n\n用户：")

    # 公式格式（固定）
    if settings['tools']['formula']['enabled']:
        latex_message = "\n\n当你想使用latex公式时，你必须是用 ['$', '$'] 作为行内公式定界符，以及 ['$$', '$$'] 作为行间公式定界符。\n\n"
        content_append(request.messages, 'system', latex_message)

    # 语言要求（固定）
    if settings['tools']['language']['enabled']:
        language_message = f"请使用{settings['tools']['language']['language']}语言说话！，不要使用其他语言，语气风格为{settings['tools']['language']['tone']}\n\n"
        content_append(request.messages, 'system', language_message)

    # 贴纸包（固定）
    if settings["stickerPacks"]:
        have_stickerPack = False
        for stickerPack in settings["stickerPacks"]:
            if stickerPack["enabled"]:
                sticker_message = f"\n\n图片库名称：{stickerPack['name']}，包含的图片：{json.dumps(stickerPack['stickers'])}\n\n"
                content_append(request.messages, 'system', sticker_message)
                have_stickerPack = True
        if have_stickerPack:
            content_append(request.messages, 'system', "\n\n当你需要使用图片时，请将图片的URL放在markdown的图片标签中，例如：\n\n<silence>![图片名](图片URL)</silence>\n\n，图片markdown必须另起并且独占一行！<silence>和</silence>是控制TTS的静音标签，表示这个图片部分不会进入语音合成\n\n你必须在回复中正确使用 <silence> 标签来包裹图片的 Markdown 语法\n\n<silence>和</silence>与图片的 Markdown 语法之间不能有空格和回车，会导致解析失败！\n\n")

    # text2img 规则（固定）
    if settings['text2imgSettings']['enabled']:
        text2img_messages = "\n\n当你使用画图工具后，必须将图片的URL放在markdown的图片标签中，例如：\n\n<silence>![图片名](图片URL)</silence>\n\n，图片markdown必须另起并且独占一行！请主动发给用户，工具返回的结果，用户看不到！<silence>和</silence>是控制TTS的静音标签，表示这个图片部分不会进入语音合成\n\n你必须在回复中正确使用 <silence> 标签来包裹图片的 Markdown 语法\n\n注意！！！<silence>和</silence>与图片的 Markdown 语法之间不能有空格和回车，会导致解析失败！\n\n"
        content_append(request.messages, 'system', text2img_messages)

    # VRM 表情（固定）
    if settings['VRMConfig']['enabledExpressions'] and not request.is_app_bot and not request.is_sub_agent:
        Expression_messages = "\n\n你可以使用以下表情：<happy> <angry> <sad> <neutral> <surprised> <relaxed>\n\n你可以在句子开头插入表情符号以驱动人物的当前表情，注意！你需要将表情符号放到句子的开头（如果有音色标签，就放到音色标签之后即可），才能在说这句话的时候同步做表情，例如：<angry>我真的生气了。<surprised>哇！<happy>我好开心。\n\n一定要把表情符号跟要做表情的句子放在同一行，如果表情符号和要做表情的句子中间有换行符，表情也将不会生效，例如：\n\n<happy>\n我好开心。\n\n此时，表情符号将不会生效。"
        content_append(request.messages, 'system', Expression_messages)

    # VRM 动作（固定）
    if settings['VRMConfig']['enabledMotions'] and not request.is_app_bot and not request.is_sub_agent:
        motions = settings['VRMConfig']['defaultMotions'] + settings['VRMConfig']['userMotions']
        motion_tags = [f"<{m.get('name','')}>" for m in motions]
        print(motion_tags)
        Motion_messages = (
            "\n\n你可以使用以下动作："
            + ", ".join(motion_tags) +
            "\n\n你可以在句子开头插入动作符号以驱动人物的当前动作，注意！你需要将动作符号放到句子的开头（如果有音色标签，就放到音色标签之后即可），"
            "才能在说这句话的时候同步做动作，例如：<scratchHead>我真的生气了。<playFingers>哇！<akimbo>我好开心。\n\n"
            "一定要把动作符号跟要做动作的句子放在同一行，如果动作符号和要做动作的句子中间有换行符，"
            "动作也将不会生效，例如：\n\n<playFingers>\n我好开心。\n\n此时，动作符号将不会生效。"
        )
        content_append(request.messages, 'system', Motion_messages)

    # THA 表情/动作（固定）
    if settings.get('THAConfig', {}).get('enabledEmotions') and not request.is_app_bot and not request.is_sub_agent:
        from py.tha_engine import THA_MOTIONS
        motion_names = list(THA_MOTIONS.keys())
        motion_tags = [f"<{m}>" for m in motion_names]
        # VRM 表情消费端按裸名精确匹配标签，无法识别带权重的形式（如 happy:0.6），
        # 因此 VRM 表情启用时不注入权重/细粒度语法段
        vrm_expressions_active = bool(settings.get('VRMConfig', {}).get('enabledExpressions'))
        fine_control_enabled = bool(settings.get('THAConfig', {}).get('enabledFineControl'))

        tha_prompt_base = (
            "\n\n你可以通过以下标签控制你的虚拟形象表情和动作：\n\n"
            "【表情标签】<happy> <angry> <sad> <neutral> <surprised> <relaxed>\n"
            f"【动作标签】{', '.join(motion_tags)}\n\n"
            "使用方法：将标签放在句子开头（如果有音色标签，就放到音色标签之后即可），例如：\n"
            "<angry>我真的生气了。<surprised>哇！<happy>我好开心。<nod>好的，没问题！\n\n"
        )
        tha_prompt_weights = (
            "【表情强度与混合】表情标签支持强度控制和多表情混合，格式为 <表情:强度>，强度范围 0~1：\n"
            "- <happy:0.3> 微微一笑（不必总是满强度，细腻的表情更自然）\n"
            "- <happy:0.5><surprised:0.4> 惊喜交加（多个表情按权重混合）\n"
            "- <sad:0.3><angry:0.2> 委屈中带一点不满\n"
            "根据语境自行判断表情强度：轻描淡写用 0.2~0.4，明显情绪用 0.5~0.7，强烈情绪用 0.8~1.0。\n"
            "不带强度的标签（如 <happy>）等价于强度 1.0。\n\n"
        )
        tha_prompt_fine_control = (
            "【细粒度控制】当预设表情无法表达复杂情绪时，你可以直接控制五官部位（同样支持 :强度 与混合）：\n"
            "- 眉毛：<eyebrow_troubled>八字眉(悲伤) <eyebrow_angry>怒眉 <eyebrow_raised>挑眉 "
            "<eyebrow_happy>开心眉 <eyebrow_lowered>压低眉 <eyebrow_serious>严肃眉\n"
            "- 眼睛：<eye_happy>笑眼(眼角弯弯，喜悦/揶揄时使用，建议0.3~0.6) <eye_surprised>睁大 "
            "<eye_relaxed>放松闭眼 <eye_unimpressed>半睁眼(倦怠/冷淡，非笑意) "
            "<eye_wink>双眼闭合 <wink_left>眨左眼 <wink_right>眨右眼 <eye_lower_eyelid>眯眼 <iris_small>瞳孔缩小\n"
            "- 嘴巴：<mouth_smile>嘴角上扬 <mouth_frown>嘴角下垂 <mouth_open>张嘴(笑着张嘴需搭配mouth_smile) "
            "<mouth_grin>咧嘴露齿 <mouth_eee>咧嘴eee <mouth_ooo>嘟嘴 <mouth_smirk>得意笑\n"
            "细粒度控制可以组合出预设没有的复杂表情，例如：\n"
            "- 强颜欢笑（悲伤但嘴角带笑）：<eyebrow_troubled:0.6><eye_relaxed:0.2><mouth_smile:0.4>\n"
            "- 眯眼笑着调侃：<eye_happy:0.5><mouth_open:0.45><mouth_smile:0.7><eyebrow_raised:0.4>\n"
            "- 得意地挑眉：<eyebrow_raised:0.7><mouth_smirk:0.6><eye_lower_eyelid:0.3>\n"
            "- 无语扶额感：<eye_unimpressed:0.8><eyebrow_lowered:0.4><mouth_frown:0.2>\n"
            "多数控制在 0.3~0.6 区间已具有充分表现力，接近 1.0 的取值仅用于极端情绪。\n"
            "冲突的控制（如同时张嘴和嘟嘴）会被自动调和，可放心组合。\n\n"
        )
        tha_prompt_rules = (
            "规则：\n"
            "1. 表情标签会影响后续所有句子，直到切换为新的表情\n"
            "2. 动作标签是一次性的，只影响当前这句话\n"
            "3. 表情和动作可以同时使用，例如：<happy:0.6><nod>太棒了！\n"
            "4. 标签必须与句子在同一行，中间有换行符则不会生效\n\n"
        )

        # 提示词分段装配：(启用条件, 片段)，新增语法段时在此追加
        tha_prompt_sections = [
            (True, tha_prompt_base),
            (not vrm_expressions_active, tha_prompt_weights),
            (fine_control_enabled and not vrm_expressions_active, tha_prompt_fine_control),
            (True, tha_prompt_rules),
        ]
        THA_Expression_messages = "".join(part for enabled, part in tha_prompt_sections if enabled)
        content_append(request.messages, 'system', THA_Expression_messages)

    # TTS 规则（固定，原用 prepend 改为 append）
    newttsList = []
    Narrator_label = "Narrator"
    if settings['ttsSettings']['enabled'] and not request.is_sub_agent:
        # 获取角色名称
        cur_memory_tts = None
        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"]:
            memoryId = settings["memorySettings"]["selectedMemory"]
            for memory in settings["memories"]:
                if memory["id"] == memoryId:
                    cur_memory_tts = memory
                    break
        selectedMemoryName_tts = cur_memory_tts["name"] if cur_memory_tts else settings["memorySettings"]["selectedMemory"]

        if settings['ttsSettings']['newtts'] and settings['memorySettings']['is_memory'] and not request.is_app_bot:
            for key in settings['ttsSettings']['newtts']:
                if settings['ttsSettings']['newtts'][key]['enabled']:
                    newttsList.append(key)
            if newttsList:
                finalttsList = ["<silence>"]
                if selectedMemoryName_tts in newttsList:
                    finalttsList.append("<"+selectedMemoryName_tts+">")
                if "Narrator" in newttsList:
                    finalttsList.append("<Narrator>")
                    Narrator_label = "Narrator"
                if "旁白" in newttsList:
                    finalttsList.append("<旁白>")
                    Narrator_label = "旁白"

                finalttsList = json.dumps(finalttsList, ensure_ascii=False, indent=4)
                print("可用音色：",finalttsList)
                
                newtts_messages = f"""
你生成的内容都会被TTS模型转换成语音。

你可以使用以下音色：

{finalttsList}

（所有的音色标签必须成对出现！例如：<音色名></音色名>），被<silence></silence>标签括起来的部分不会进入语音合成，

当你生成回答时，你需要以XML格式组织回答，将不同的旁白或角色的文字用<音色名></音色名>括起来，以表示这些话是使用这个音色，以控制不同TTS转换成对应音色。

对于没有对应音色的部分，可以不括。即使音色名称不为英文，还是可以照样使用<音色名>使用该音色的文本</音色名>来启用对应音色。

注意！如果是你扮演的角色的名字在音色列表里，你必须用这个音色标签将你扮演的角色说话的部分括起来！

只要是非人物说话的部分，都视为旁白！角色音色应该标记在人物说话的前后！例如：`<{Narrator_label}>现在是下午三点，她说道：</{Narrator_label}><{selectedMemoryName_tts}>天气真好哇！</{selectedMemoryName_tts}><silence>(眼睛笑成了一条线)</silence><{Narrator_label}>说完她伸了个懒腰。</{Narrator_label}><{selectedMemoryName_tts}>我们出去玩吧！</{selectedMemoryName_tts}>`

还有注意！<音色名></音色名>之间不能嵌套，只能并列，并且<音色名>和</音色名>必须成对出现，防止出现音色混乱！

如果没有什么需要静音的文字，也没有必要强行使用<silence></silence>标签，因为这样会导致语音合成速度变慢！

<silence></silence>标签最好用于图片的markdown语法、网页链接等不适合语音合成的部分，并且<silence></silence>标签必须另起一行，并且独占一行！<silence></silence>标签与图片的markdown语法之间不能有空格和回车，否则会导致解析失败！比如<silence>![example](https://example.com/example.png)</silence>\n\n就可以正确解析图片，但是<silence>\n![example](https://example.com/example.png)\n</silence>就会导致前端无法显示这个图片！\n\n

注意！你最好只使用你正在扮演的角色音色和旁白音色，不要使用其他角色音色，除非你明确知道你在做什么！\n\n"""
                content_append(request.messages, 'system', newtts_messages)  # 改为 append
        else:
            tts_messages = f"""你生成的内容都会被TTS模型转换成语音。<silence></silence>表示静音，被<silence></silence>标签括起来的部分不会进入语音合成。\n\n

如果没有什么需要静音的文字，也没有必要强行使用<silence></silence>标签，因为这样会导致语音合成速度变慢！

<silence></silence>标签最好用于图片的markdown语法、网页链接等不适合语音合成的部分，并且<silence></silence>标签必须另起一行，并且独占一行！<silence></silence>标签与图片的markdown语法之间不能有空格和回车，否则会导致解析失败！比如<silence>![example](https://example.com/example.png)</silence>\n\n就可以正确解析图片，但是<silence>\n![example](https://example.com/example.png)\n</silence>就会导致前端无法显示这个图片！\n\n"""
            content_append(request.messages, 'system', tts_messages)  # 改为 append

    # A2UI 能力（固定，内容很长，放在固定区末尾）
    if settings['tools']['a2ui']['enabled'] and not request.is_app_bot and not request.is_sub_agent:
        A2UI_messages = """
除了使用自然语言回答用户问题外，你还拥有一个特殊能力：**渲染 A2UI 界面**。

# Capability: A2UI
当用户的请求涉及到**数据收集、参数配置、多项选择、富文本展示、表单提交**或**代码展示**时，请不要只用文字描述，而是直接生成 A2UI 代码来呈现界面。

# Formatting Rules (重要规则)
1. 将 A2UI JSON 包裹在 ```a2ui ... ``` 代码块中。
2. **【绝对禁止】嵌套 Markdown 代码块**：在 JSON 字符串内部（例如 Text 或 Card 的 content 属性中），**绝对不要**使用 Markdown 的代码块语法（即不要出现 ``` 符号）。这会导致解析器崩溃。
3. **如果需要展示代码**：必须使用专门的 `Code` 组件。

# Component Reference (组件参考)
请严格遵守 props 结构。

## 1. 基础展示
- **Text**: `{ "type": "Text", "props": { "content": "Markdown文本(也就是普通文本，支持加粗等，但不支持代码块)" } }` (★ 请勿滥用，如无必要，请直接使用markdown文字即可，而不是放到A2UI JSON中)
- **Code**: `{ "type": "Code", "props": { "content": "print('hello')", "language": "python" } }` (★ 展示代码专用，替代MD代码块)
- **Table**: `{ "type": "Table", "props": { "headers": ["列1", "列2"], "rows": [ ["a1", "b1"], ["a2", "b2"] ] } }` (★ 请勿滥用，如果你想要画一个表格，请直接使用markdown表格语法即可，而不是放到A2UI JSON中)
- **Alert**: `{ "type": "Alert", "props": { "title": "标题", "content": "内容", "variant": "success/warning/info/error" } }`
- **Divider**: `{ "type": "Divider" }`

## 2. 布局容器
- **Group**: `{ "type": "Group", "title": "可选标题", "children": [...] }` (水平排列)
- **Card**: `{ "type": "Card", "props": { "title": "标题", "content": "MD内容" }, "children": [...] }`

## 3. 表单输入 (必须包含 key)
- **Input**: `{ "type": "Input", "props": { "label": "标签", "key": "field_name", "placeholder": "..." } }`
- **Slider**: `{ "type": "Slider", "props": { "label": "标签", "key": "field_name", "min": 0, "max": 100, "step": 1, "unit": "单位" } }`
- **Switch**: `{ "type": "Switch", "props": { "label": "标签", "key": "field_name" } }`
- **Rate**: `{ "type": "Rate", "props": { "label": "评价", "key": "rating" } }`
- **DatePicker**: `{ "type": "DatePicker", "props": { "label": "日期", "key": "date", "subtype": "date/datetime/year" } }`

## 4. 选项选择 (必须包含 key)
- **Select**: `{ "type": "Select", "props": { "label": "标签", "key": "field_name", "options": ["A", "B"] } }` (下拉菜单)
- **Radio**: `{ "type": "Radio", "props": { "label": "标签", "key": "field_name", "options": [{"label":"男","value":"m"}, {"label":"女","value":"f"}] } }`
- **Checkbox**: `{ "type": "Checkbox", "props": { "label": "标签", "key": "field_name", "options": ["篮球", "足球"] } }`

## 5. 交互动作
- **Button**: `{ "type": "Button", "props": { "label": "按钮文字", "action": "submit/search/clear", "variant": "primary/danger/default" } }`
  - `action="submit"`: 提交表单数据给助手。
  - `action="search"`: 搜索（配合 Input 使用）。
  - `action="clear"`: **清空/重置当前表单**（不会发送消息，仅在本地清除内容）。

## 6. 多媒体
- **TTSBlock**: `{ "type": "TTSBlock", "props": { "content": "要朗读的文本", "label": "可选标签", "voice": "可选声音ID" } }` (点击即可播放语音，适合展示示范发音、语音消息)
- **Audio**: `{ "type": "Audio", "props": { "src": "https://example.com/sound.mp3", "title": "音频标题" } }` (原生音频播放器)

# Examples

## Ex 1: 参数配置 (Slider + Switch)
User: 帮我把生成温度设为 0.8，并开启流式输出。
Assistant: 好的，已为您准备好配置面板：
```a2ui
{
  "type": "Card",
  "props": { "title": "模型配置" },
  "children": [
    { "type": "Slider", "props": { "label": "Temperature (随机性)", "key": "temp", "min": 0, "max": 2, "step": 0.1 } },
    { "type": "Switch", "props": { "label": "流式输出 (Stream)", "key": "stream", "defaultValue": true } },
    { "type": "Button", "props": { "label": "保存配置", "action": "submit" } }
  ]
}
```

## Ex 2: 问卷调查 (Radio + Checkbox + Rate)
User: 我想做一个满意度调查。
Assistant: 没问题，这是一个调查问卷模板：
```a2ui
{
  "type": "Form",
  "children": [
    { "type": "Alert", "props": { "title": "用户反馈", "content": "感谢您的参与，这对我们很重要。", "variant": "info" } },
    { "type": "Radio", "props": { "label": "您的性别", "key": "gender", "options": ["男", "女", "保密"] } },
    { "type": "Checkbox", "props": { "label": "您感兴趣的话题", "key": "interests", "options": ["科技", "生活", "娱乐"] } },
    { "type": "Rate", "props": { "label": "总体评分", "key": "score" } },
    { "type": "Input", "props": { "label": "其他建议", "key": "comment" } },
    { "type": "Button", "props": { "label": "提交反馈", "action": "submit", "variant": "primary" } }
  ]
}
```

## Ex 3: 需要在交互式界面中显示代码（不在A2UI内部显示代码，直接使用markdown代码块即可！）
User: 模拟一个linux终端。
Assistant: 代码如下：
```a2ui
{
  "type": "Card",
  "props": {
    "title": "Linux 终端模拟器"
  },
  "children": [
    {
      "type": "Input",
      "props": {
        "label": "输入命令",
        "key": "command",
        "placeholder": "例如：ls, pwd, whoami, date, echo 'Hello' 等"
      }
    },
    {
      "type": "Group",
      "children": [
        {
          "type": "Button",
          "props": {
            "label": "执行命令",
            "action": "submit",
            "variant": "primary"
          }
        },
        {
          "type": "Button",
          "props": {
            "label": "清空输出",
            "action": "search"
          }
        }
      ]
    },
    {
      "type": "Divider"
    },
    {
      "type": "Text",
      "props": {
        "content": "**终端输出区域：**"
      }
    },
    {
      "type": "Code",
      "props": {
        "content": "user@linux-terminal:~$ 等待输入命令...",
        "language": "bash"
      }
    }
  ]
}
```

## Ex 4: 语言学习场景 (TTSBlock 使用)
User: 教我用日语说“你好”。
Assistant: 好的，请听标准发音：
```a2ui
{
  "type": "Card",
  "props": { "title": "日语教学" },
  "children": [
    { "type": "Text", "props": { "content": "“你好”在日语中是：**こんにちは** (Konnichiwa)" } },
    { 
      "type": "TTSBlock", 
      "props": { 
        "label": "点击试听",
        "content": "こんにちは",
        "voice": "ja-JP-NanamiNeural" 
      } 
    },
    { "type": "Alert", "props": { "title": "提示", "content": "通常用于白天见面时。", "variant": "info" } }
  ]
}
```

## Ex 5: 带重置功能的表单
User: 我想写一篇博客，需要填标题和内容，但我可能想重写。
Assistant: 
```a2ui
{
  "type": "Card",
  "props": { "title": "撰写新文章" },
  "children": [
    { "type": "Input", "props": { "label": "文章标题", "key": "title" } },
    { "type": "Input", "props": { "label": "正文内容", "key": "content" } },
    { 
      "type": "Group", 
      "children": [
        { "type": "Button", "props": { "label": "清空重写", "action": "clear", "variant": "danger" } },
        { "type": "Button", "props": { "label": "立即发布", "action": "submit", "variant": "primary" } }
      ]
    }
  ]
}
```

## 滥用行为1（请不要以这样的方式回复）：
User: 画一个人工智能相关的表格。
Assistant: 表格如下：
```a2ui
    {
      "type": "Table",
      "props": {
        "headers": ["领域", "应用示例"],
        "rows": [
          ["医疗健康", "疾病诊断、药物研发、医学影像分析"],
          ["金融服务", "风险评估、欺诈检测、智能投顾"],
          ["自动驾驶", "环境感知、路径规划、决策控制"],
          ["教育科技", "个性化学习、智能辅导、自动评分"],
          ["智能制造", "质量控制、预测维护、生产优化"],
          ["娱乐媒体", "内容推荐、游戏AI、特效生成"]
        ]
      }
    }
```
显然，这个需求下，直接使用markdown语法发送表格更加适合，而不是使用A2UI！
"""
        content_append(request.messages, 'system', A2UI_messages)

    # ==================== 半固定文件注入（系统消息，变化频率低） ====================
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        # MEMORY.md
        memory_file = Path(cwd) / ".agents" / "MEMORY.md"
        if memory_file.exists() and memory_file.is_file():
            try:
                import aiofiles
                async with aiofiles.open(memory_file, 'r', encoding='utf-8') as mf:
                    mem_content = await mf.read()
                if mem_content.strip():
                    content_append(request.messages, 'system', f"\n\n**MEMORY.md**:\n{mem_content}\n\n")
            except Exception as e:
                print(f"读取 MEMORY.md 失败: {e}")

        # AGENTS.md
        try:
            agents_md = await read_agents_md(cwd)
            if agents_md:
                content_append(request.messages, 'system', " **重要事项**（.agents/AGENTS.md）：\n\n"+agents_md+"\n\n")
        except Exception as e:
            print(f"[Agent Loader] 跳过AGENTS.md加载: {e}")
            pass

        # 项目技能摘要
        try:
            skills_message = await get_project_skills_summary(cwd, visibilityScope)
            if skills_message:
                content_append(request.messages, 'system', skills_message)
        except Exception as e:
            print(f"[Skill Loader] 扫描技能失败: {e}")

    # 群聊模式（半固定，成员变化才会变）
    cur_memory = None
    if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"]:
        memoryId = settings["memorySettings"]["selectedMemory"]
        for memory in settings["memories"]:
            if memory["id"] == memoryId:
                cur_memory = memory
                break
    selectedMemoryName = cur_memory["name"] if cur_memory else settings["memorySettings"]["selectedMemory"]

    def resolve_agent_name(raw_model):
        if raw_model.startswith("memory/"):
            parts = raw_model.split('/', 2)
            if len(parts) >= 2:
                memory_id = parts[1]
                for memory in settings["memories"]:
                    if memory["id"] == memory_id:
                        return memory["name"]
                return raw_model
        return raw_model

    if settings["isGroupMode"] and not request.is_app_bot and not request.is_sub_agent:
        selectedGroupAgents = settings['selectedGroupAgents']
        if selectedGroupAgents:
            userName = "user"
            if settings["memorySettings"]["userName"]:
                userName = settings["memorySettings"]["userName"]
            selectedGroupAgents.append(userName)
            agent_names = [resolve_agent_name(agent) for agent in selectedGroupAgents]
            group_message = f"\n\n你当前处于群聊模式，群聊中的角色有：{agent_names}\n\n你在扮演{selectedMemoryName}"
            content_append(request.messages, 'system', group_message)

    # ==================== 动态内容收集（最后注入，变化频率从低到高） ====================
    # 1. 本地环境信息（如果 local 环境，可能包含动态内容，放在动态区）
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine == "local":
        system_context_local = get_system_context()
        if system_context_local:
            content_append(request.messages, 'system', system_context_local)

    # 2. 待办事项
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine in ["ds", "local"]:
        try:
            todos = await read_todos_local(cwd)
            if isinstance(todos, list) and len(todos) > 0:
                priority_icons = {"high": "🔴", "medium": "🟡", "low": "🟢"}
                status_icons = {"pending": "⏳", "in_progress": "🔄", "done": "✅", "cancelled": "❌"}
                priority_order = {"high": 0, "medium": 1, "low": 2}
                todos_sorted = sorted(todos, key=lambda x: (priority_order.get(x.get('priority', 'medium'), 1), x.get('created_at', '')))
                todo_lines = ["\n\n当你完成一个事项后，请记得使用todo_write_tool更新项目待办事项，所有事项结束后，可以删除本事项文件\n\n📋 **当前项目待办事项**（.agents/ai_todos.json）：\n"]
                pending_count = 0
                for todo in todos_sorted:
                    status = todo.get('status', 'pending')
                    if status != 'done':
                        pending_count += 1
                        icon = status_icons.get(status, "⏳")
                        priority = priority_icons.get(todo.get('priority', 'medium'), "🟡")
                        content_text = todo.get('content', '无内容')[:50]
                        if len(todo.get('content', '')) > 50:
                            content_text += "..."
                        todo_lines.append(f"{icon} {priority} [{todo.get('id', 'unknown')}] {content_text}")
                if pending_count == 0:
                    todo_lines.append("✨ 当前没有待办事项，所有任务已完成！")
                else:
                    todo_lines.append(f"\n*共有 {pending_count} 个未完成任务*")
                todo_message = "\n".join(todo_lines)
                content_append(request.messages, 'system', todo_message)
        except Exception as e:
            print(f"[Todo Loader] 跳过待办事项加载: {e}")

    # 3. 子任务进度（cowork 模式）
    if permissionMode == "cowork" and not request.is_sub_agent:
        if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine in ["ds", "local"]:
            sub_task_context = await query_task_progress(cwd)
            if sub_task_context:
                content_append(request.messages, 'system', sub_task_context)

    # 4. VTS 状态（每轮表情可能不同）
    from py.vts_manager import vts_instance
    if vts_instance.is_running and not request.is_app_bot and not request.is_sub_agent:
        all_exp_names = [f"<{e['name']}>" for e in vts_instance.model_expressions]
        all_mot_names = [f"<{h['name']}>" for h in vts_instance.available_hotkeys]
        active_list = vts_instance.current_active_expressions
        status_text = "、".join(active_list) if active_list else "平静"
        if all_exp_names or all_mot_names:
            vts_prompt = f"""
\n\n# 人物表现控制
你当前正在控制 Live2D 模型。当前表情状态：{status_text}。

【可用表情标签】(发送即表示切换，并自动重置其他表情)
{" ".join(all_exp_names)}

【可用动作标签】(触发一次性动画)
{" ".join(all_mot_names)}

【使用规则】
1. 每一句回复开头都可以插入一个标签。
2. 表情标签是排他性的：如果你发送新的表情标签，系统会自动为你关闭旧表情。
3. 标签必须放在句首，严禁换行。
"""
            content_append(request.messages, 'system', vts_prompt)

    # 5. 好感度数值（每轮可能变化）
    love_settings = settings.get('loveSettings', {})
    if love_settings.get('enabled', False) and not request.is_app_bot and not request.is_sub_agent:
        default_user = settings.get("memorySettings", {}).get("userName", "").strip() or "User"
        from py.affection_system import load_affection_data 
        affection_data = await load_affection_data()
        dimensions = love_settings.get("dimensions", ["love", "Familiarity"])
        custom_prompt = love_settings.get("prompt", "根据当前对话的内容、情感色彩以及你的角色设定，合理地评估或微调这些数值（每次增减幅度建议在-5到+5之间）。")
        user_prompt_text = ""
        if request.messages and request.messages[-1]['role'] == 'user':
            user_prompt_text = str(request.messages[-1].get('content', ''))
        relevant_users = set()
        for known_name in affection_data.keys():
            if known_name and known_name in user_prompt_text:
                relevant_users.add(known_name)
        if default_user in affection_data:
            relevant_users.add(default_user)
        status_block = ""
        if relevant_users:
            status_block = "目前的已知羁绊数据参考：\n"
            for ru in relevant_users:
                user_stats = affection_data.get(ru, {})
                stats_str = ", ".join([f"{dim}: {user_stats.get(dim, 0)}" for dim in dimensions])
                status_block += f"- {ru}: {stats_str}\n"
        tag_example = "<user=发言者的真实名字"
        for dim in dimensions:
            tag_example += f" {dim}=1"
        tag_example += ">"
        affection_message = f"""

# 角色羁绊与数值系统
{status_block}
【更新规则】
{custom_prompt}

【动态识别发言者】
请准确识别当前最新消息的**实际发言者**：
- 如果消息是类似“某某发送弹幕：”、“某某说：”的格式，发言者就是该名字（例如“小包”）。
- 如果没有带有这种特定的名字前缀，则默认当前的发言者是“{default_user}”。

你 **必须** 在每次回复的**绝对最末尾**（所有正文、代码、表情都输出完毕之后），输出一个隐藏的数据标签来记录**该发言者**的最新数值（如果是第一次见面的新用户，请直接给一个合理的初始值）。
格式 **必须** 严格遵守以下示例（将“发言者的真实名字”替换为你识别出的真实名字，且必须包含所有维度）：
{tag_example}

注意：系统会自动隐藏<>包裹的文本，请直接输出标签，绝对不要在标签前后加任何解释、加粗或Markdown代码块包裹！
"""
        content_append(request.messages, 'system', affection_message)

    # ==================== 极短动态内容注入到用户消息末尾 ====================
    # 快捷指令响应（仅当轮触发）
    # 总开关为系统设置中的全局 enableShortcuts；注入类（#记忆 / 技能）仍需启用 CLI 工具并配置工作区
    from py.shortcut_commands import is_shortcuts_enabled
    if is_shortcuts_enabled(settings) and cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        user_text = ""
        if request.messages and request.messages[-1]['role'] == 'user':
            user_msg_content = request.messages[-1].get('content', '')
            if isinstance(user_msg_content, str):
                user_text = user_msg_content
            elif isinstance(user_msg_content, list):
                user_text = "".join([item.get('text', '') for item in user_msg_content if item.get('type') == 'text'])
        user_text_trimmed = user_text.strip()
        if user_text_trimmed:
            import datetime
            if user_text_trimmed.startswith('#'):
                mem_content_to_save = user_text_trimmed[1:].strip()
                if mem_content_to_save:
                    try:
                        agent_dir = Path(cwd) / ".agents"
                        agent_dir.mkdir(parents=True, exist_ok=True)
                        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        append_text = f"\n- [{timestamp}] {mem_content_to_save}"
                        import aiofiles
                        async with aiofiles.open(Path(cwd) / ".agents" / "MEMORY.md", 'a', encoding='utf-8') as mf:
                            await mf.write(append_text)
                        # 注入到用户消息末尾
                        if request.messages[-1]['role'] == 'user':
                            request.messages[-1]['content'] += f"\n\n[系统提示：用户刚刚使用'#'指令保存了以下记忆：“{mem_content_to_save}”，请简短确认你已记住。]"
                    except Exception as e:
                        print(f"保存 MEMORY.md 失败: {e}")
            elif user_text_trimmed.startswith('/'):
                parts = user_text_trimmed[1:].split()
                if parts:
                    skill_name = parts[0]
                    skill_dir = Path(cwd) / ".agents" / "skills" / skill_name
                    if skill_dir.exists() and skill_dir.is_dir():
                        doc_file_path = None
                        for name in ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]:
                            if (skill_dir / name).exists():
                                doc_file_path = skill_dir / name
                                break
                        if doc_file_path:
                            try:
                                import aiofiles
                                async with aiofiles.open(doc_file_path, 'r', encoding='utf-8') as f:
                                    skill_content = await f.read()
                                # 注入到用户消息末尾
                                if request.messages[-1]['role'] == 'user':
                                    request.messages[-1]['content'] += f"\n\n[系统提示：用户激活了技能“{skill_name}”，技能说明：\n{skill_content}\n请严格按技能说明处理用户请求。]"
                            except Exception as e:
                                print(f"读取技能文档失败: {e}")

    # 时间戳（每轮绝对变化）
    if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'beforeThinking':
        time_message = f"\n\n最后一条消息发送时间：{local_timezone}  {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}"
        # 追加到用户消息末尾
        if request.messages and request.messages[-1]['role'] == 'user':
            request.messages[-1]['content'] += time_message

    print(f"系统提示：{request.messages[0]['content']}")
    return request

def get_drs_stage(DRS_STAGE):
    if DRS_STAGE == 1:
        drs_msg = "当前阶段为明确用户需求阶段，你需要分析用户的需求，并给出明确的需求描述。如果用户的需求描述不明确，你可以暂时不完成任务，而是分析需要让用户进一步明确哪些需求。"
    elif DRS_STAGE == 2:
        drs_msg = "当前阶段为工具调用阶段，利用你的知识库、互联网搜索、数据库查询、各类MCP等你所有的工具（如果有，这些工具不一定会提供），执行计划中未完成的步骤。每次完成计划中的一个步骤。在工具调用阶段中，你不要完成最终任务，而是尽可能的调用相关的工具，为最后的回答阶段做准备。"
    elif DRS_STAGE == 3:
        drs_msg = "当前阶段为生成结果阶段，根据当前收集到的所有信息，完成任务，给出任务执行结果。如果用户要求你生成一个超过2000字的回答，你可以尝试将该任务拆分成多个部分，每次只完成其中一个部分。"
    else:
        drs_msg = "当前阶段为生成结果阶段，根据当前收集到的所有信息，完成任务，给出任务执行结果。如果用户要求你生成一个超过2000字的回答，你可以尝试将该任务拆分成多个部分，每次只完成其中一个部分。"
    return drs_msg  

def get_drs_stage_name(DRS_STAGE):
    if DRS_STAGE == 1:
        drs_stage_name = "明确用户需求阶段"
    elif DRS_STAGE == 2:
        drs_stage_name = "工具调用阶段"
    elif DRS_STAGE == 3:
        drs_stage_name = "生成结果阶段"
    else:
        drs_stage_name = "生成结果阶段"
    return drs_stage_name

def get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content):
    drs_stage_name = get_drs_stage_name(DRS_STAGE)
    if DRS_STAGE == 1:
        search_prompt = f"""
# 当前状态：

## 初始任务：
{user_prompt}

## 当前结果：
{full_content}

## 当前阶段：
{drs_stage_name}

# 深度研究一共有三个阶段：1: 明确用户需求阶段 2: 工具调用阶段 3: 生成结果阶段

## 当前阶段，请输出json字符串：

### 如果需要用户明确需求，请输出json字符串（如果你已经在上一轮对话中向用户提出过明确需求，请不要重复使用"need_more_info"，这会导致用户无法快速获取结果）：
{{
    "status": "need_more_info",
    "unfinished_task": ""
}}

### 如果不需要进一步明确需求，进入并进入工具调用阶段，请输出json字符串：
{{
    "status": "need_work",
    "unfinished_task": ""
}}
"""
    elif DRS_STAGE == 2:
        search_prompt = f"""
# 当前状态：

## 初始任务：
{user_prompt}

## 当前结果：
{full_content}

## 当前阶段：
{drs_stage_name}

# 深度研究一共有三个阶段：1: 明确用户需求阶段 2: 工具调用阶段 3: 生成结果阶段

## 注意！工具调用阶段，是为最后的回答阶段做准备。不需要生成最终的回答，如果已经没有未完成的需要调用工具的步骤，请进入生成结果阶段。

## 当前阶段，请输出json字符串：

### 如果还有计划中的需要调用工具的步骤没有完成，请输出json字符串：
{{
    "status": "need_more_work",
    "unfinished_task": "这里填入未完成的步骤"
}}

### 如果所有计划的需要调用工具的步骤都已完成，进入生成结果阶段，请输出json字符串：
{{
    "status": "answer",
    "unfinished_task": ""
}}
"""    
    else:
        search_prompt = f"""
# 当前状态：

## 初始任务：
{user_prompt}

## 当前结果：
{full_content}

## 当前阶段：
{drs_stage_name}

# 深度研究一共有三个阶段：1: 明确用户需求阶段 2: 工具调用阶段 3: 生成结果阶段

## 当前阶段，请输出json字符串：

如果初始任务已完成，请输出json字符串：
{{
    "status": "done",
    "unfinished_task": ""
}}

如果初始任务未完成，请输出json字符串：
{{
    "status": "not_done",
    "unfinished_task": "这里填入未完成的任务"
}}
"""    
    return search_prompt

# =========================================================================
# 第二阶段：强制合法性清洗 (Sanitizer) - 无论是否压缩都必须执行
# 目标：彻底杜绝 Messages with role 'tool' must be a response... 报错
# =========================================================================
def get_role(m): return m.get("role") if isinstance(m, dict) else m.role
def get_tcs(m): 
    if get_role(m) != "assistant": return None
    return m.get("tool_calls") if isinstance(m, dict) else getattr(m, "tool_calls", None)

# =========================================================================
# 第三阶段：思考模式字段填充 (Thinking Mode Sanitizer)
# 目标：防止 "reasoning_content must be passed back" 错误
# 策略：为所有 assistant 消息添加 reasoning_content: ""
# =========================================================================

def ensure_thinking_fields(messages):
    """为所有 assistant 消息确保 reasoning_content 字段存在（缺失则补空字符串），但不覆盖已有值。"""
    if not messages:
        return messages
    for msg in messages:
        role = get_role(msg)
        if role == "assistant":
            if isinstance(msg, dict):
                if "reasoning_content" not in msg:
                    msg["reasoning_content"] = ""
            else:
                if not hasattr(msg, "reasoning_content"):
                    setattr(msg, "reasoning_content", "")
    return messages

def sanitize_tool_calls(messages: list) -> list:
    """
    最终兜底：确保任意一条带有 tool_calls 的 assistant 消息
    后面都紧跟着数量匹配的 tool 消息，且 tool_call_id 一一对应。
    
    - 如果 content 为空且 tool_calls 缺少对应的 tool 响应 → 直接删除整条 assistant
    - 如果 content 不为空但 tool_calls 缺少对应的 tool 响应 → 抹掉 tool_calls，保留文本
    - 如果 tool 消息找不到对应的 assistant tool_calls → 删除孤立的 tool 消息
    """
    if not messages:
        return messages

    # 统一转成易处理的格式
    msgs = []
    for m in messages:
        if isinstance(m, dict):
            msgs.append(m.copy())
        else:
            # 简单转为字典（你的消息大概率已经是 dict）
            msgs.append(m)

    i = 0
    while i < len(msgs):
        msg = msgs[i]
        role = msg.get("role")
        
        if role == "assistant" and msg.get("tool_calls"):
            # 收集该 assistant 应该有的所有 tool_call_id
            expected_ids = {tc["id"] for tc in msg["tool_calls"]}
            
            # 找到紧随其后的连续 tool 消息
            j = i + 1
            tool_msgs = []
            while j < len(msgs) and msgs[j].get("role") == "tool":
                tool_msgs.append(msgs[j])
                j += 1
            
            # 检查是否有缺失
            found_ids = {tm["tool_call_id"] for tm in tool_msgs if "tool_call_id" in tm}
            missing_ids = expected_ids - found_ids
            
            if missing_ids:
                # 判断 assistant 是否有实际文字内容
                content = msg.get("content")
                has_text = bool(content and str(content).strip())
                
                if has_text:
                    # 保留文字，抹掉 tool_calls
                    msgs[i]["tool_calls"] = None
                    # 同时删除后面那些已经找到的孤立的 tool 消息（因为它们现在没有对应的 assistant tool_calls 了）
                    del msgs[i+1:j]  # 删除 i+1 到 j-1 的所有 tool 消息
                    print(f"[Sanitizer] 抹除 assistant 的 tool_calls 并移除相关 tool 消息，保留文本。缺失 id: {missing_ids}")
                else:
                    # 没有实质内容，直接删除这条 assistant 和它带的无效 tool 消息
                    del msgs[i]        # 删除 assistant 本身
                    # 注意 j 在删除 i 之后会前移一位，所以要重新计算
                    # 删除原来跟在它后面的 tool 消息
                    # i 已经指向原来 i+1 的位置（因为删了 i），所以删除从 i 到 j-1
                    del msgs[i:j-1]    # 因为 i 已经指向了原来 i+1，所以删除 tool 消息的长度要调整
                    print(f"[Sanitizer] 删除无内容的 tool_calls assistant 及后续孤立的 tool 消息。缺失 id: {missing_ids}")
                    # 因为 i 已经被删除，指针不能前进，继续从当前位置检查
                    continue
            else:
                # 所有 tool_call_id 都找到了，正常
                # 跳过这些 tool 消息，继续检查后面的
                i = j  # 跳到 tool 消息之后
                continue
        
        elif role == "tool":
            # 检查这条 tool 消息前面是否有对应的 assistant tool_calls
            # 向前找最近的一个 assistant
            k = i - 1
            found = False
            while k >= 0:
                if msgs[k].get("role") == "assistant" and msgs[k].get("tool_calls"):
                    tids = {tc["id"] for tc in msgs[k]["tool_calls"]}
                    if msg.get("tool_call_id") in tids:
                        found = True
                    break
                k -= 1
            if not found:
                # 孤立的 tool 消息，删除
                del msgs[i]
                print(f"[Sanitizer] 删除孤立的 tool 消息: {msg.get('tool_call_id')}")
                continue
        
        i += 1

    return msgs

async def heartbeat_wrapper(gen, interval=90):
    """Wraps an async generator to yield SSE heartbeat comments periodically,
    preventing frontend read timeouts during long-thinking intervals."""
    queue = asyncio.Queue()

    async def reader():
        try:
            async for chunk in gen:
                await queue.put(('data', chunk))
        except Exception as e:
            await queue.put(('error', e))
        finally:
            await queue.put(('done', None))

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(interval)
                await queue.put(('heartbeat', None))
        except asyncio.CancelledError:
            pass

    gen_task = asyncio.create_task(reader())
    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            kind, payload = await queue.get()
            if kind == 'data':
                yield payload
            elif kind == 'heartbeat':
                yield ": heartbeat\n\n"
            elif kind == 'error':
                raise payload
            elif kind == 'done':
                break
    finally:
        hb_task.cancel()
        gen_task.cancel()
        with suppress(asyncio.CancelledError):
            await hb_task
        with suppress(asyncio.CancelledError):
            await gen_task

async def generate_stream_response(client, reasoner_client, request: ChatRequest, settings: dict, 
                                   fastapi_base_url, enable_thinking, enable_deep_research, 
                                   enable_web_search, async_tools_id):
    try:
        from mem0 import Memory
        global mcp_client_list, HA_client, ChromeMCP_client, sql_client
        
        DRS_STAGE = 1
        if len(request.messages) > 2:
            DRS_STAGE = 2
            
        vision_cfg = settings.get('vision', {})
        vision_control_enabled = settings.get('visionControlSettings', {}).get('enabled', False)
        user_prompt = request.messages[-1].get('content') or ""
        
        # 1. 只要开启了计算机控制 或者 符合桌面视觉唤醒词条件，就进行初始截图
        should_capture = False
        if vision_control_enabled and settings.get('visionControlSettings', {}).get('desktopVision', False):
            should_capture = True
        elif vision_cfg.get('desktopVision'):
            # 检查唤醒词
            if vision_cfg.get('enableWakeWord'):
                wake_words = [w.strip() for w in vision_cfg.get('wakeWord', "").split('\n') if w.strip()]
                if any(word in user_prompt for word in wake_words):
                    should_capture = True
            else:
                # 未开启唤醒词则默认每次捕获（或根据需求调整）
                should_capture = True
        
        if should_capture:
            try:
                import pyautogui
                from py.computer_use_tool import set_screen_region
                # 引入我们刚刚编写的跨平台 UI 树抓取工具
                from py.ui_tree_helper import get_desktop_ui_tree
                
                v_settings = settings.get('visionControlSettings', {})
                is_full_screen = v_settings.get('isFullScreen', True)
                screen_size = v_settings.get('ScreenSize', [0, 0, 1280, 720])
                is_grid_enabled = vision_control_enabled and v_settings.get('isEnableGrid', False)

                print(f"正在执行桌面截图 (全屏: {is_full_screen}, 网格: {is_grid_enabled})...")
                
                # 初始化截图偏移量
                offset_x, offset_y = 0, 0
                
                # 1. 根据全屏配置决定截取范围，并同步给鼠标工具
                if not is_full_screen and len(screen_size) == 4:
                    x, y, w, h = map(int, screen_size)
                    offset_x, offset_y = x, y  # 设定偏移量，用于对齐 UI 树坐标
                    
                    # 截取指定区域
                    screenshot = await asyncio.to_thread(pyautogui.screenshot, region=(x, y, w, h))
                    logical_width, logical_height = w, h
                    set_screen_region((x, y, w, h))
                else:
                    # 全屏截图
                    logical_width, logical_height = pyautogui.size()
                    screenshot = await asyncio.to_thread(pyautogui.screenshot)
                    set_screen_region(None)
                
                # 2. 统一缩放到逻辑坐标系 (解决 Windows DPI 缩放偏移)
                if screenshot.width != logical_width or screenshot.height != logical_height:
                    screenshot = await asyncio.to_thread(
                        screenshot.resize, (logical_width, logical_height), Image.Resampling.LANCZOS
                    )
                
                # 3. 缩放到传输尺寸 (1280x720 左右)
                target_w, target_h = scale_to_fit(logical_width, logical_height, 1280, 720)
                if screenshot.width > target_w or screenshot.height > target_h:
                    print(f"检测到高分辨率屏幕，正在从 {screenshot.size} 缩放到 {(target_w, target_h)}")
                    screenshot = await asyncio.to_thread(
                        screenshot.resize, (target_w, target_h), Image.Resampling.LANCZOS
                    )

                # 4. 根据设置决定是否绘制网格，并生成网格提示
                if is_grid_enabled:
                    display_image = await asyncio.to_thread(draw_grid_on_image, screenshot.copy(), grid_spacing=10)
                    grid_hint = "\n\n【system info】Current screenshot with coordinate grid (0-1000) is injected. Use coordinates for precise clicking."
                else:
                    display_image = screenshot
                    grid_hint = "\n\n【system info】Current desktop screenshot is injected."

                ui_tree_hint = ""
                if vision_control_enabled:
                    print("正在异步提取跨平台无障碍 UI 树并进行 0-1000 坐标对齐...")
                    # 传入逻辑视口尺寸 (logical_width, logical_height) 和 偏移量 (offset_x, offset_y)
                    ui_tree_json = await get_desktop_ui_tree(
                        logical_width=logical_width,
                        logical_height=logical_height,
                        offset_x=offset_x,
                        offset_y=offset_y
                    )
                    ui_tree_hint = f"\n\n【system info】Current Interactive UI Elements (Index of clickable items on screen with 0-1000 grid):\n```json\n{ui_tree_json}\n```\nYou can click any element using the provided [center_x, center_y] coordinates (which correspond perfectly to your 0-1000 grid input)."

                # 5. 保存图片
                file_prefix = "desktop_grid" if is_grid_enabled else "desktop_plain"
                desktop_img_name = f"{file_prefix}_{uuid.uuid4().hex}.png"
                desktop_img_path = os.path.join(UPLOAD_FILES_DIR, desktop_img_name)
                
                await asyncio.to_thread(display_image.save, desktop_img_path, optimize=True)
                desktop_url = f"{fastapi_base_url}uploaded_files/{desktop_img_name}"
                
                # ==========================================
                # 6. 注入到当前消息最后（完美兼容文本与多模态列表消息）
                # ==========================================
                current_user_msg = request.messages[-1]
                full_hint = grid_hint + ui_tree_hint  # 将图片提示和 UI 树结合起来

                if isinstance(current_user_msg['content'], str):
                    original_text = current_user_msg['content']
                    current_user_msg['content'] = [
                        {"type": "text", "text": original_text + full_hint},
                        {"type": "image_url", "image_url": {"url": desktop_url}}
                    ]
                elif isinstance(current_user_msg['content'], list):
                    # 如果已经是多模态列表，寻找其中的 text 节点并将 UI 树追加在末尾
                    text_updated = False
                    for item in current_user_msg['content']:
                        if item.get('type') == 'text':
                            item['text'] = item['text'] + full_hint
                            text_updated = True
                            break
                    if not text_updated:
                        # 如果没有 text 节点，手动追加一个 text 节点
                        current_user_msg['content'].append({"type": "text", "text": full_hint})
                        
                    # 最后追加截图
                    current_user_msg['content'].append(
                        {"type": "image_url", "image_url": {"url": desktop_url}}
                    )
                
                # 7. 清理历史截图 (如果开启了 onlyNewScreen)
                if settings.get('visionControlSettings', {}).get('onlyNewScreen', False):
                    for msg in request.messages[:-1]:
                        if isinstance(msg.get('content'), list):
                            new_content = [item for item in msg['content'] if item.get('type') != 'image_url']
                            if len(new_content) == 1 and new_content[0].get('type') == 'text':
                                msg['content'] = new_content[0]['text']
                            else:
                                msg['content'] = new_content
                    print("已清理历史上下文中的旧截图。")

                print(f"桌面截图与精简 UI 树已成功合并注入: {desktop_url}")

            except Exception as e:
                print(f"后端桌面截图或 UI 树提取失败: {e}")

        # =========================================================================
        # 第一阶段：上下文压缩 (仅在达到阈值时触发，决定“保留哪些消息”)
        # =========================================================================
        max_rounds = settings.get("max_rounds", 0)
        chat_messages = request.messages # 这里的 chat_messages 包含 system
        
        if max_rounds > 0:
            
            # 区分系统消息和对话消息
            sys_msgs = [m for m in chat_messages if get_role(m) == "system"]
            dialog_msgs = [m for m in chat_messages if get_role(m) != "system"]
            
            # 设定压缩阈值：当非系统消息超过 max_rounds * 2 + 1 时开始压缩
            if len(dialog_msgs) > (max_rounds * 2 + 1):
                keep_indices = set()
                
                # 1. 总是保留第一条消息 (Anchor User Prompt)
                if len(dialog_msgs) > 0: keep_indices.add(0)
                
                # 2. 保留所有 User 消息 (User 优先策略)
                for i, m in enumerate(dialog_msgs):
                    if get_role(m) == "user": keep_indices.add(i)
                
                # 3. 保留每个 Turn 的最后一个 Assistant 消息 (最终答案)
                for i in range(len(dialog_msgs)):
                    if get_role(dialog_msgs[i]) == "assistant":
                        is_last = True
                        for j in range(i + 1, len(dialog_msgs)):
                            if get_role(dialog_msgs[j]) == "assistant":
                                is_last = False; break
                            if get_role(dialog_msgs[j]) == "user": break
                        if is_last: keep_indices.add(i)
                
                # 4. 保留最近的活跃窗口 (最近 N 条消息，确保当前工具链不被切断)
                tail_start = max(0, len(dialog_msgs) - (max_rounds * 2))
                for i in range(tail_start, len(dialog_msgs)):
                    keep_indices.add(i)
                
                # 构造初步压缩后的列表
                compressed_dialog = [dialog_msgs[i] for i in sorted(list(keep_indices))]
                chat_messages = sys_msgs + compressed_dialog
                print(f"[Context] Compressed to {len(chat_messages)} msgs.")

        final_messages = []
        pending_tool_call_ids = set()

        for msg in chat_messages:
            role = get_role(msg)
            
            if role == "tool":
                t_id = msg.get("tool_call_id") if isinstance(msg, dict) else getattr(msg, "tool_call_id", None)
                # 核心校验：如果这个 tool 消息不在我们记录的待响应 ID 列表中，直接丢弃
                if t_id and t_id in pending_tool_call_ids:
                    final_messages.append(msg)
                    pending_tool_call_ids.remove(t_id) # 匹配成功，移除
                else:
                    print(f"[Sanitizer] 丢弃孤立的 tool 消息: {t_id}")
                    continue
            
            elif role == "assistant":
                tcs = get_tcs(msg)
                if tcs:
                    # 这是一个发起工具调用的消息
                    # 暂时先存入，并记录它期望的 ID
                    current_tcs_ids = {tc.get("id") if isinstance(tc, dict) else tc.id for tc in tcs}
                    final_messages.append(msg)
                    for tid in current_tcs_ids: pending_tool_call_ids.add(tid)
                else:
                    # 普通助手回复
                    final_messages.append(msg)
            
            else:
                # user 或 system 消息，直接通过
                final_messages.append(msg)

        # 最终反向检查：如果最后一条是带 tool_calls 的 assistant，但后面没有 tool 消息
        # 我们需要移除这些 tool_calls 标记，或者直接移除该条消息（取决于业务需求）
        # 这里选择保留消息文本但清空 tool_calls，防止 API 报错
        while final_messages:
            last_msg = final_messages[-1]
            tcs = get_tcs(last_msg)
            # 如果最后一条助手消息发起了调用，但我们已经没有后续消息来填补它了
            if tcs and any( ( (tc.get("id") if isinstance(tc, dict) else tc.id) in pending_tool_call_ids ) for tc in tcs ):
                # 如果该消息有文本内容，我们抹除 tool_calls 保留文本
                # 如果没文本，就直接弹出整条消息
                content = last_msg.get("content") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")
                if content:
                    if isinstance(last_msg, dict):
                        last_msg["tool_calls"] = None
                    else:
                        setattr(last_msg, "tool_calls", None)
                    print("[Sanitizer] 抹除末尾未闭合的 tool_calls")
                    break # 处理完毕
                else:
                    final_messages.pop()
                    print("[Sanitizer] 弹出末尾无内容的孤立 tool_call 发起消息")
            else:
                break

        request.messages = final_messages
        request.messages = ensure_thinking_fields(request.messages)
        # =========================================================================
        images = await images_in_messages(request.messages,fastapi_base_url)
        request.messages = await message_without_images(request.messages)

        m0 = None
        memoryId = None
        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != ""  and not request.is_sub_agent:
            memoryId = settings["memorySettings"]["selectedMemory"]
            cur_memory = None
            for memory in settings["memories"]:
                if memory["id"] == memoryId:
                    cur_memory = memory
                    break
            if cur_memory and cur_memory["providerId"]:
                print("长期记忆启用")
                config={
                    "embedder": {
                        "provider": 'openai',
                        "config": {
                            "model": cur_memory['model'],
                            "api_key": cur_memory['api_key'],
                            "openai_base_url":cur_memory["base_url"],
                            "embedding_dims":cur_memory.get("embedding_dims", 1024)
                        },
                    },
                    "llm": {
                        "provider": 'openai',
                        "config": {
                            "model": settings['model'],
                            "api_key": settings['api_key'],
                            "openai_base_url":settings["base_url"]
                        }
                    },
                    "vector_store": {
                        "provider": "faiss",
                        "config": {
                            "collection_name": "agent-party",
                            "path": os.path.join(MEMORY_CACHE_DIR,memoryId),
                            "distance_strategy": "euclidean",
                            "embedding_model_dims": cur_memory.get("embedding_dims", 1024)
                        }
                    }
                }
                m0 = Memory.from_config(config)
                print("长期记忆配置加载完成")
        open_tag = "<think>"
        close_tag = "</think>"

        tools = request.tools or []
        tool_names = set() 
        if mcp_client_list:
            for server_name, mcp_client in mcp_client_list.items():
                if server_name in settings['mcpServers']:
                    if 'disabled' not in settings['mcpServers'][server_name]:
                        settings['mcpServers'][server_name]['disabled'] = False
                    if settings['mcpServers'][server_name]['disabled'] == False and settings['mcpServers'][server_name]['processingStatus'] == 'ready':
                        disable_tools = []
                        for tool in settings['mcpServers'][server_name].get("tools", []): 
                            if tool.get("enabled", True) == False:
                                disable_tools.append(tool["name"])
                        function = await mcp_client.get_openai_functions(disable_tools=disable_tools)
                        if function:
                            tools.extend(function)
        # 🔥 Node 扩展的工具
        for ext_id, tools_list in node_ext_mcp_tools.items():
            for tool in tools_list:
                tool_name = tool.get('name')
                if tool_name and tool_name not in tool_names:
                    tool_names.add(tool_name)
                    tools.append({
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "description": tool.get('description', f'来自扩展 {ext_id} 的工具'),
                            "parameters": tool.get('parameters', {
                                "type": "object",
                                "properties": {},
                                "required": []
                            })
                        }
                    })
                else:
                    print(f"[WARNING] 跳过重复工具: {tool_name}")

        get_llm_tool_fuction = await get_llm_tool(settings)
        if get_llm_tool_fuction:
            tools.append(get_llm_tool_fuction)
        get_agent_tool_fuction = await get_agent_tool(settings)
        if get_agent_tool_fuction:
            tools.append(get_agent_tool_fuction)
        get_a2a_tool_fuction = await get_a2a_tool(settings)
        if get_a2a_tool_fuction:
            tools.append(get_a2a_tool_fuction)
        if settings["HASettings"]["enabled"]:
            ha_tool = await HA_client.get_openai_functions(disable_tools=[])
            if ha_tool:
                tools.extend(ha_tool)
        if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
            chromeMCP_tool = await ChromeMCP_client.get_openai_functions(disable_tools=[])
            if chromeMCP_tool:
                tools.extend(chromeMCP_tool)
        if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
            tools.extend(all_cdp_tools)
        if settings['sqlSettings']['enabled']:
            sql_tool = await sql_client.get_openai_functions(disable_tools=[])
            if sql_tool:
                tools.extend(sql_tool)
        if settings['CLISettings']['enabled']:
            if settings['CLISettings']['engine'] == 'ds':
                tools.extend(get_tools_for_mode('yolo'))
            elif settings['CLISettings']['engine'] == 'local':
                tools.extend(get_local_tools_for_mode('yolo'))
            elif settings['CLISettings']['engine'] == 'acp':
                tools.append(acp_agent_tool)
        if  settings['CLISettings']['mode_change']:
            tools.append(mode_change_tool)
        if settings['visionControlSettings']['enabled']:
            tools.extend(computer_use_tools)
            if settings['visionControlSettings']['mouse']:
                tools.extend(mouse_use_tools)
            if settings['visionControlSettings']['keyboard']:
                tools.extend(keyboard_use_tools)
            if not settings['visionControlSettings']['desktopVision']:
                tools.extend(desktopVision_use_tools)
        if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'afterThinking':
            tools.append(time_tool)
        if settings["tools"]["weather"]['enabled']:
            tools.append(weather_tool)
            tools.append(location_tool)
            tools.append(timer_weather_tool)
        if settings["tools"]["wikipedia"]['enabled']:
            tools.append(wikipedia_summary_tool)
            tools.append(wikipedia_section_tool)
        if settings["tools"]["arxiv"]['enabled']:
            tools.append(arxiv_tool)
        if (settings.get("diarySettings", {}) or {}).get("enabled", False):
            tools.append(diary_query_tool)
            tools.append(diary_books_tool)
        if settings['text2imgSettings']['enabled']:
            if settings['text2imgSettings']['engine'] == 'pollinations' and not _is_steam_build:
                tools.append(pollinations_image_tool)
            elif settings['text2imgSettings']['engine'] == 'openai':
                tools.append(openai_image_tool)
            elif settings['text2imgSettings']['engine'] == 'openaiChat':
                tools.append(openai_chat_image_tool)
        if settings['tools']['getFile']['enabled']:
            tools.append(file_tool)
            tools.append(image_tool)
        if settings['tools']['autoBehavior']['enabled'] and request.messages[-1]['role'] == 'user':
            tools.append(auto_behavior_tool)
        if settings["codeSettings"]['enabled']:
            if settings["codeSettings"]["engine"] == "e2b":
                tools.append(e2b_code_tool)
            elif settings["codeSettings"]["engine"] == "sandbox":
                tools.append(local_run_code_tool)
        if settings["custom_http"]:
            for custom_http in settings["custom_http"]:
                if custom_http["enabled"]:
                    if custom_http['body'] == "":
                        custom_http['body'] = "{}"
                    custom_http_tool = {
                        "type": "function",
                        "function": {
                            "name": f"custom_http_{custom_http['name']}",
                            "description": f"{custom_http['description']}",
                            "parameters": json.loads(custom_http['body']),
                        },
                    }
                    tools.append(custom_http_tool)
        if settings["workflows"]:
            for workflow in settings["workflows"]:
                if workflow["enabled"]:
                    comfyui_properties = {}
                    comfyui_required = []
                    if workflow["text_input"] is not None:
                        comfyui_properties["text_input"] = {
                            "description": "第一个文字输入，需要输入的提示词，用于生成图片或者视频，如果无特别提示，默认为英文",
                            "type": "string"
                        }
                        comfyui_required.append("text_input")
                    if workflow["text_input_2"] is not None:
                        comfyui_properties["text_input_2"] = {
                            "description": "第二个文字输入，需要输入的提示词，用于生成图片或者视频，如果无特别提示，默认为英文",
                            "type": "string"
                        }
                        comfyui_required.append("text_input_2")
                    if workflow["image_input"] is not None:
                        comfyui_properties["image_input"] = {
                            "description": "第一个图片输入，需要输入的图片，必须是图片URL，可以是外部链接，也可以是服务器内部的URL，例如：https://www.example.com/xxx.png  或者  http://127.0.0.1:3456/xxx.jpg",
                            "type": "string"
                        }
                        comfyui_required.append("image_input")
                    if workflow["image_input_2"] is not None:
                        comfyui_properties["image_input_2"] = {
                            "description": "第二个图片输入，需要输入的图片，必须是图片URL，可以是外部链接，也可以是服务器内部的URL，例如：https://www.example.com/xxx.png  或者  http://127.0.0.1:3456/xxx.jpg",
                            "type": "string"
                        }
                        comfyui_required.append("image_input_2")
                    comfyui_parameters = {
                        "type": "object",
                        "properties": comfyui_properties,
                        "required": comfyui_required
                    }
                    comfyui_tool = {
                        "type": "function",
                        "function": {
                            "name": f"comfyui_{workflow['unique_filename']}",
                            "description": f"{workflow['description']}+\n如果要输入图片提示词或者修改提示词，尽可能使用英语。\n返回的图片结果，请将图片的URL放入![image]()这样的markdown语法中，用户才能看到图片。如果是视频，请将视频的URL放入<video controls> <source src=''></video>的中src中，用户才能看到视频。如果有多个结果，则请用换行符分隔开这几个图片或者视频，用户才能看到多个结果。",
                            "parameters": comfyui_parameters,
                        },
                    }
                    tools.append(comfyui_tool)
        
        source_prompt = ""
        if request.fileLinks:
            print("fileLinks",request.fileLinks)
            # 异步获取文件内容
            files_content = await get_files_content(request.fileLinks)
            fileLinks_message = f"\n\n相关文件内容：{files_content}"
            
            # 修复字符串拼接错误
            content_append(request.messages, 'system', fileLinks_message)
            source_prompt += fileLinks_message

        user_prompt = request.messages[-1].get('content') or ""

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "" and not request.is_sub_agent:
            # 用户名提示（固定）
            if settings["memorySettings"]["userName"]:
                print("添加用户名：\n\n" + settings["memorySettings"]["userName"] + "\n\n用户名结束\n\n")
                content_append(request.messages, 'system', "与你交流的默认用户名为：\n\n" + settings["memorySettings"]["userName"] + "\n\n注意！除非用户消息中提到了是其他用户发送，否则视为默认用户发送的消息\n\n")

            # 固定人设：角色描述、性格、对话示例、自定义 systemPrompt、通用 systemPrompt
            if cur_memory["description"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["description"] = cur_memory["description"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["description"] = cur_memory["description"].replace("{{char}}", cur_memory["name"])
                print("添加角色设定：\n\n" + cur_memory["description"] + "\n\n角色设定结束\n\n")
                content_append(request.messages, 'system', "角色设定：\n\n" + cur_memory["description"] + "\n\n角色设定结束\n\n")

            if cur_memory["personality"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["personality"] = cur_memory["personality"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["personality"] = cur_memory["personality"].replace("{{char}}", cur_memory["name"])
                print("添加性格设定：\n\n" + cur_memory["personality"] + "\n\n性格设定结束\n\n")
                content_append(request.messages, 'system', "性格设定：\n\n" + cur_memory["personality"] + "\n\n性格设定结束\n\n")

            if cur_memory['mesExample']:
                if settings["memorySettings"]["userName"]:
                    cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{char}}", cur_memory["name"])
                print("添加对话示例：\n\n" + cur_memory['mesExample'] + "\n\n对话示例结束\n\n")
                content_append(request.messages, 'system', "对话示例：\n\n" + cur_memory['mesExample'] + "\n\n对话示例结束\n\n")

            if cur_memory["systemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + cur_memory["systemPrompt"] + "\n\n")

            if settings["memorySettings"]["genericSystemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    settings["memorySettings"]["genericSystemPrompt"] = settings["memorySettings"]["genericSystemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                settings["memorySettings"]["genericSystemPrompt"] = settings["memorySettings"]["genericSystemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + settings["memorySettings"]["genericSystemPrompt"] + "\n\n")

        # ========== 日记集成：将近期日记注入对话上下文 ==========
        diary_cfg = (settings.get("diarySettings", {}) or {}).get("chatIntegration", {}) or {}
        if diary_cfg.get("enabled", False) and not request.is_sub_agent:
            try:
                ms = (settings or {}).get("memorySettings", {}) or {}
                diary_book_id = DIARY_DEFAULT_BOOK
                if ms.get("is_memory") and ms.get("selectedMemory"):
                    diary_book_id = ms.get("selectedMemory")
                max_entries = max(1, int(diary_cfg.get("maxEntries", 5) or 5))
                recent = await get_recent_diary_entries(diary_book_id, max_entries)
                if recent:
                    diary_lines = []
                    for e in recent:
                        t = e.get("title", "") or e.get("content", "")[:24]
                        diary_lines.append(f"- [{e.get('time', '')[:16]}] ({e.get('type', '')}) {t}: {e.get('content', '')[:200]}")
                    diary_text = "\n".join(diary_lines)
                    content_append(request.messages, 'system',
                        "\n\n[角色日记 - 近期回忆]\n以下是该角色最近的日记记录，可供你参考其心境和经历：\n" + diary_text + "\n")
                    print(f"📔 [日记集成] 已注入 {len(recent)} 条日记到对话上下文")
            except Exception as e:
                print(f"[日记集成] 提取日记失败: {e}")

        # ========== 动态上下文收集（统一追加到用户消息末尾） ==========
        dynamic_user_context = ""

        # 世界书匹配（动态，基于当前轮输入/回复触发）
        lore_content = ""
        assistant_reply = ""
        for i in range(len(request.messages)-1, -1, -1):
            if request.messages[i]['role'] == 'assistant':
                assistant_reply = request.messages[i]['content']
                break

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and not request.is_sub_agent:
            if cur_memory.get("characterBook"):
                for lore in cur_memory["characterBook"]:
                    lore_keys = [key for key in lore.get("keysRaw", "").split("\n") if key != ""]
                    if lore_keys and any(key in user_prompt or key in assistant_reply for key in lore_keys):
                        lore_content += lore['content'] + "\n\n"

        if lore_content:
            if settings["memorySettings"]["userName"]:
                lore_content = lore_content.replace("{{user}}", settings["memorySettings"]["userName"])
            lore_content = lore_content.replace("{{char}}", cur_memory["name"])
            print("添加世界观设定（动态，注入到用户消息）：\n\n" + lore_content + "\n\n世界观设定结束\n\n")
            dynamic_user_context += f"\n\n[世界设定]\n{lore_content}"

        # 记忆检索（动态，基于当前用户输入）
        if m0 and not request.is_sub_agent:
            memoryLimit = settings["memorySettings"]["memoryLimit"]
            try:
                relevant_memories = await asyncio.to_thread(
                    m0.search,
                    query=user_prompt,
                    user_id=settings["memorySettings"]["selectedMemory"],
                    limit=memoryLimit
                )
                relevant_memories = json.dumps(relevant_memories, ensure_ascii=False)
            except Exception as e:
                print("m0.search error:", e)
                relevant_memories = ""
            if relevant_memories:
                print("添加相关记忆（动态，注入到用户消息）：\n\n" + relevant_memories + "\n\n相关结束\n\n")
                dynamic_user_context += f"\n\n[相关记忆]\n{relevant_memories}"

        # 将动态内容追加到最后一条 user 消息的末尾
        if dynamic_user_context:
            if request.messages and request.messages[-1]['role'] == 'user':
                request.messages[-1]['content'] += dynamic_user_context
        
        request = await tools_change_messages(request, settings)
        # ========== 对话缓冲：记录用户消息用于闲时自动总结 ==========
        try:
            diary_settings = (settings.get("diarySettings", {}) or {})
            if diary_settings.get("enabled", False) and diary_settings.get("chatSummary", {}).get("enabled", True):
                ms = (settings or {}).get("memorySettings", {}) or {}
                buffer_key = ms.get("selectedMemory") or DIARY_DEFAULT_BOOK
                update_buffer_identity(buffer_key, book_id=buffer_key,
                                       character_name=(ms.get("userName") or ""))
                last_msg = request.messages[-1] if request.messages else None
                if last_msg and last_msg.get("role") == "user":
                    append_to_chat_buffer(buffer_key, "user", _extract_text_content(last_msg.get("content", "")))
        except Exception as e:
            print(f"[DiaryBuffer] 记录对话缓冲失败: {e}")
        # 如果系统消息为空字符串或者仅包含空白符，则将系统消息改成"you are a helpful assistant."
        if request.messages[0]['role'] == 'system' and not request.messages[0]['content'].strip():
            request.messages[0]['content'] = "you are a helpful assistant."
        chat_vendor = 'OpenAI'
        reasoner_vendor = 'OpenAI'
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['selectedProvider']:
                chat_vendor = modelProvider['vendor']
                break
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                reasoner_vendor = modelProvider['vendor']
                break
        if chat_vendor == 'Dify':
            try:
                if len(request.messages) >= 3:
                    if request.messages[2]['role'] == 'user':
                        if request.messages[1]['role'] == 'assistant':
                            request.messages[2]['content'] = "你上一次的发言：\n" +request.messages[0]['content'] + "\n你上一次的发言结束\n\n用户：" + request.messages[2]['content']
                        if request.messages[0]['role'] == 'system':
                            request.messages[2]['content'] = "系统提示：\n" +request.messages[0]['content'] + "\n系统提示结束\n\n" + request.messages[2]['content']
                elif len(request.messages) >= 2:
                    if request.messages[1]['role'] == 'user':
                        if request.messages[0]['role'] == 'system':
                            request.messages[1]['content'] = "系统提示：\n" +request.messages[0]['content'] + "\n系统提示结束\n\n用户：" + request.messages[1]['content']
            except Exception as e:
                print("Dify error:",e)
        model = settings['model']
        extra_params = settings['extra_params']
        # 移除extra_params这个list中"name"不包含非空白符的键值对
        if extra_params:
            for extra_param in extra_params:
                if not extra_param['name'].strip():
                    extra_params.remove(extra_param)
            # 列表转换为字典
            extra_params = process_extra_params(extra_params)
        else:
            extra_params = {}
        async def stream_generator(user_prompt,DRS_STAGE,tools,images):
            # ---------- 统一 SSE 封装 ----------
            def make_sse(tool_data: dict) -> str:
                chunk = {
                    "choices": [{
                        "delta": {
                            "tool_content": tool_data, # 这里直接传字典
                        }
                    }]
                }
                return f"data: {json.dumps(chunk)}\n\n"
            try:
                extra = {}
                reasoner_extra = {}
                if chat_vendor == 'OpenAI':
                    extra['max_completion_tokens'] = request.max_tokens or settings['max_tokens']
                else:
                    extra['max_tokens'] = request.max_tokens or settings['max_tokens']
                if settings.get('enableOmniTTS',False) and not request.is_sub_agent:
                    extra['modalities'] = ["text", "audio"]
                    extra['audio'] ={"voice": settings.get('omniVoice',"Cherry"), "format": "wav"}
                if reasoner_vendor == 'OpenAI':
                    reasoner_extra['max_completion_tokens'] = settings['reasoner']['max_tokens']
                else:
                    reasoner_extra['max_tokens'] = settings['reasoner']['max_tokens']
                if request.reasoning_effort or settings['reasoning_effort']:
                    extra['reasoning_effort'] = request.reasoning_effort or settings['reasoning_effort']
                if settings['reasoner']['reasoning_effort'] is not None:
                    reasoner_extra['reasoning_effort'] = settings['reasoner']['reasoning_effort']
                # 处理传入的异步工具ID查询
                if async_tools_id:
                    responses_to_send = []
                    responses_to_wait = []
                    async with async_tools_lock:
                        # 收集已完成的结果并删除条目
                        for tid in list(async_tools.keys()):  # 转成list避免字典修改异常
                            if tid in async_tools_id:
                                if async_tools[tid]["status"] in ("completed", "error"):
                                    responses_to_send.append({
                                        "tool_id": tid,
                                        **async_tools.pop(tid)  # 移除已处理的条目
                                    })
                                elif async_tools[tid]["status"] == "pending":
                                    responses_to_wait.append({
                                        "tool_id": tid,
                                        "name":async_tools[tid]["name"],
                                        "parameters": async_tools[tid]["parameters"]
                                    })
                    for response in responses_to_send:
                        tid = response["tool_id"]
                        if response["status"] == "completed":
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": response["name"], "content": str(response["result"]), "type": "tool_result"},
                                        "async_tool_id": tid,
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                            request.messages.insert(-1, 
                                {
                                    "tool_calls": [
                                        {
                                            "id": "agentParty",
                                            "function": {
                                                "arguments": json.dumps(response["parameters"]),
                                                "name": response["name"],
                                            },
                                            "type": "function",
                                        }
                                    ],
                                    "role": "assistant",
                                    "content": "",
                                    "reasoning_content": "",
                                }
                            )
                            request.messages.insert(-1, 
                                {
                                    "role": "tool",
                                    "tool_call_id": "agentParty",
                                    "name": response["name"],
                                    "content": f"之前调用的异步工具（{tid}）的结果：\n\n{response['result']}\n\n====结果结束====\n\n你必须根据工具结果回复未回复的问题或需求。请不要重复调用该工具！"
                                }
                            )
                        if response["status"] == "error":
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"{tid}{await t('tool_result')}", "content": f"Error: {str(response['result'])}"},
                                        "async_tool_id": tid
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                            request.messages.append({
                                "role": "system",
                                "content": f"之前调用的异步工具（{tid}）发生错误：\n\n{response['result']}\n\n====错误结束====\n\n"
                            }) 
                    for response in responses_to_wait:
                        # 在request.messages倒数第一个元素之前的位置插入一个新元素
                        request.messages.insert(-1, 
                            {
                                "tool_calls": [
                                    {
                                        "id": "agentParty",
                                        "function": {
                                            "arguments": json.dumps(response["parameters"]),
                                            "name": response["name"],
                                        },
                                        "type": "function",
                                    }
                                ],
                                "role": "assistant",
                                "content": "",
                                "reasoning_content": "",
                            }
                        )
                        results = f"{response["name"]}工具已成功启动，获取结果需要花费很久的时间。请不要再次调用该工具，因为工具结果将生成后自动发送，再次调用也不能更快的获取到结果。请直接告诉用户，你会在获得结果后回答他的问题。"
                        request.messages.insert(-1, 
                            {
                                "role": "tool",
                                "tool_call_id": "agentParty",
                                "name": response["name"],
                                "content": str(results),
                            }
                        )
                kb_list = []
                if settings["knowledgeBases"]:
                    for kb in settings["knowledgeBases"]:
                        if kb["enabled"] and kb["processingStatus"] == "completed":
                            kb_list.append({"kb_id":kb["id"],"name": kb["name"],"introduction":kb["introduction"]})
                if settings["KBSettings"]["when"] == "before_thinking" or settings["KBSettings"]["when"] == "both":
                    if kb_list:
                        chunk_dict = {
                            "id": "webSearch",
                            "choices": [
                                {
                                    "finish_reason": None,
                                    "index": 0,
                                    "delta": {
                                        "role":"assistant",
                                        "content": "",
                                        "tool_content": {"title": "query_knowledge_base", "content": "", "type": "call"},
                                    }
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        all_kb_content = []
                        # 用query_knowledge_base函数查询kb_list中所有的知识库
                        for kb in kb_list:
                            kb_content = await query_knowledge_base(kb["kb_id"],user_prompt)
                            all_kb_content.extend(kb_content)
                            if settings["KBSettings"]["is_rerank"]:
                                all_kb_content = await rerank_knowledge_base(user_prompt,all_kb_content)
                        if all_kb_content:
                            all_kb_content = json.dumps(all_kb_content, ensure_ascii=False, indent=4)
                            kb_message = f"\n\n可参考的知识库内容：{all_kb_content}"
                            content_append(request.messages, 'user',  f"\n\n知识库内容：{all_kb_content}\n\n")
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": "query_knowledge_base", "content": str(all_kb_content), "type": "tool_result"},
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                if settings["KBSettings"]["when"] == "after_thinking" or settings["KBSettings"]["when"] == "both":
                    if kb_list:
                        kb_list_message = f"\n\n可调用的知识库列表：{json.dumps(kb_list, ensure_ascii=False)}"
                        content_append(request.messages, 'system', kb_list_message)
                else:
                    kb_list = []
                if settings['webSearch']['enabled'] or enable_web_search:
                    if settings['webSearch']['when'] == 'before_thinking' or settings['webSearch']['when'] == 'both':
                        chunk_dict = {
                            "id": "webSearch",
                            "choices": [
                                {
                                    "finish_reason": None,
                                    "index": 0,
                                    "delta": {
                                        "role":"assistant",
                                        "content": "",
                                        "tool_content": {"title": "web_search", "content": "", "type": "call"},
                                    }
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        if settings['webSearch']['engine'] == 'duckduckgo':
                            results = await DDGsearch(user_prompt)
                        elif settings['webSearch']['engine'] == 'searxng':
                            results = await searxng(user_prompt)
                        elif settings['webSearch']['engine'] == 'tavily':
                            results = await Tavily_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'google':
                            results = await Google_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'brave':
                            results = await Brave_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'exa':
                            results = await Exa_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'serper':
                            results = await Serper_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'bochaai':
                            results = await bochaai_search(user_prompt)
                        if results:
                            content_append(request.messages, 'user',  f"\n\n联网搜索结果：{results}\n\n")
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": "web_search", "content": str(results), "type": "tool_result"},
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                    if settings['webSearch']['when'] == 'after_thinking' or settings['webSearch']['when'] == 'both':
                        if settings['webSearch']['engine'] == 'duckduckgo' and not _is_steam_build:
                            tools.append(duckduckgo_tool)
                        elif settings['webSearch']['engine'] == 'searxng':
                            tools.append(searxng_tool)
                        elif settings['webSearch']['engine'] == 'tavily':
                            tools.append(tavily_tool)
                        elif settings['webSearch']['engine'] == 'google':
                            tools.append(google_tool)
                        elif settings['webSearch']['engine'] == 'brave':
                            tools.append(brave_tool)
                        elif settings['webSearch']['engine'] == 'exa':
                            tools.append(exa_tool)
                        elif settings['webSearch']['crawler'] == 'serper':
                            tools.append(serper_tool)
                        elif settings['webSearch']['crawler'] == 'bochaai':
                            tools.append(bochaai_tool)

                        if settings['webSearch']['crawler'] == 'jina':
                            tools.append(jina_crawler_tool)
                        elif settings['webSearch']['crawler'] == 'crawl4ai':
                            tools.append(Crawl4Ai_tool)
                        elif settings['webSearch']['crawler'] == 'firecrawl':
                            tools.append(firecrawl_tool)
                        elif settings['webSearch']['crawler'] == 'simpleRequest':
                            tools.append(simple_fetch_tool)
                        elif settings['webSearch']['crawler'] == 'mdnew':
                            tools.append(markdown_new_tool)
                if kb_list:
                    tools.append(kb_tool)

                # ==================== 获取权限模式 ====================
                cli_settings = settings.get("CLISettings", {})
                engine = cli_settings.get("engine", "")
                
                # 根据环境类型获取权限模式
                if engine == "local":
                    env_settings = settings.get("localEnvSettings", {})
                elif engine == "ds":
                    env_settings = settings.get("dsSettings", {})
                else:
                    env_settings = settings.get("acpSettings", {})
                
                permission_mode = env_settings.get("permissionMode", "default")
                if permission_mode == "cowork" and settings['CLISettings']['enabled'] and not request.is_sub_agent:
                    tools = []
                    tools.append(create_subtask_tool)
                    tools.append(query_tasks_tool)
                    tools.append(cancel_subtask_tool)
                    if  settings['CLISettings']['mode_change']:
                        tools.append(mode_change_tool)

                if permission_mode == "goal" and settings['CLISettings']['enabled'] and not request.is_sub_agent:
                    tools.append(create_subtask_tool)
                    tools.append(query_tasks_tool)
                    tools.append(cancel_subtask_tool)
                    tools.append(finish_main_task_tool)
                    if settings['CLISettings']['mode_change']:
                        tools.append(mode_change_tool)

                if request.is_sub_agent:
                    tools.append(finish_task_tool)
                # 如果是子智能体调用，或者指定了工具过滤规则
                if request.is_sub_agent or request.enable_tools or request.disable_tools:
                    original_tool_count = len(tools)
                    
                    # 1. Enable Tools 过滤（白名单模式）
                    if request.enable_tools and len(request.enable_tools) > 0:
                        # 只保留白名单中的工具
                        filtered_tools = []
                        enable_set = set(request.enable_tools)
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name in enable_set:
                                filtered_tools.append(tool)
                        
                        tools = filtered_tools
                        print(f"[Tool Filter] Enable mode: {original_tool_count} -> {len(tools)} tools (enabled: {request.enable_tools})")
                    
                    # 2. Disable Tools 过滤（黑名单模式）
                    elif request.disable_tools and len(request.disable_tools) > 0:
                        # 移除黑名单中的工具
                        disable_set = set(request.disable_tools)
                        filtered_tools = []
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name not in disable_set:
                                filtered_tools.append(tool)
                        
                        tools = filtered_tools
                        print(f"[Tool Filter] Disable mode: {original_tool_count} -> {len(tools)} tools (disabled: {request.disable_tools})")
                    
                    # 3. 子智能体默认策略（如果没有指定 enable/disable）
                    elif request.is_sub_agent:
                        # 子智能体默认只保留安全的工具，移除高风险操作
                        SUBAGENT_BLOCKED_TOOLS = [
                            
                            # 阻止子智能体管理进程/端口
                            "list_processes_tool",
                            "get_process_logs_tool",
                            "kill_process_tool",
                            "docker_manage_ports_tool",
                            "local_net_tool",
                            "send_process_input_tool",
                            
                            # 阻止子智能体创建子任务（防止递归）
                            "create_subtask",
                            
                            # 阻止高风险的浏览器操作
                            "new_page",
                            "close_page",
                            "evaluate_script",
                            
                            # 阻止子智能体使用 Agent 调用（防止复杂的嵌套）
                            "agent_tool_call",
                            "todo_write_tool",
                        ]
                        
                        filtered_tools = []
                        blocked_count = 0
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name not in SUBAGENT_BLOCKED_TOOLS:
                                filtered_tools.append(tool)
                            else:
                                blocked_count += 1
                        
                        tools = filtered_tools
                        print(f"[SubAgent Safety] Blocked {blocked_count} dangerous tools: {original_tool_count} -> {len(tools)} tools")
            

                print(tools)
                request.messages = sanitize_tool_calls(request.messages)
                if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    deepsearch_messages = copy.deepcopy(request.messages)
                    content_append(deepsearch_messages, 'user',  "\n\n将用户提出的问题或给出的当前任务拆分成多个步骤，每一个步骤用一句简短的话概括即可，无需回答或执行这些内容，直接返回总结即可，但不能省略问题或任务的细节。如果用户输入的只是闲聊或者不包含任务和问题，直接把用户输入重复输出一遍即可。如果是非常简单的问题，也可以只给出一个步骤即可。一般情况下都是需要拆分成多个步骤的。")
                    
                    # 1. 开启 stream=True 进行流式请求
                    response = await client.chat.completions.create(
                        model=model,
                        messages=deepsearch_messages,
                        stream=True,  # 新增
                        extra_body = extra_params, # 其他参数
                    )
                    
                    user_prompt = ""
                    # 生成一个唯一的 ID，用于让前端锁定同一个 UI 块进行内容更新
                    deepsearch_id = f"ds_{uuid.uuid4().hex[:8]}"
                    
                    # 2. 遍历流式响应并实时推给前端
                    async for chunk in response:
                        if not chunk.choices:
                            continue
                        
                        # 兼容不同版本的 openai 响应对象
                        chunk_dict = chunk.model_dump() if hasattr(chunk, 'model_dump') else chunk
                        delta = chunk_dict["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        
                        if content:
                            user_prompt += content
                            
                            # 3. 借用前端原有的 tool_progress 渲染机制
                            # 前端会自动创建类似 "调用deep_research工具" 的动态刷新框
                            progress_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_progress": {
                                            "name": "deep_research",
                                            "arguments": user_prompt, # 传入不断累加的内容
                                            "tool_call_id": deepsearch_id
                                        }
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(progress_chunk)}\n\n"
                    
                    content_append(request.messages, 'user',  f"\n\n如果用户没有提出问题或者任务，直接闲聊即可，如果用户提出了问题或者任务，任务描述不清晰或者你需要进一步了解用户的真实需求，你可以暂时不完成任务，而是分析需要让用户进一步明确哪些需求。")
                # 如果启用推理模型
                if settings['reasoner']['enabled'] or enable_thinking:
                    reasoner_messages = copy.deepcopy(request.messages)
                    if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                        content_append(reasoner_messages, 'user',  f"\n\n可参考的步骤：{user_prompt}\n\n")
                        drs_msg = get_drs_stage(DRS_STAGE)
                        if drs_msg:
                            content_append(reasoner_messages, 'user',  f"\n\n{drs_msg}\n\n")
                    if tools:
                        content_append(reasoner_messages, 'system',  f"可用工具：{json.dumps(tools)}")
                    for modelProvider in settings['modelProviders']: 
                        if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                            vendor = modelProvider['vendor']
                            break
                    msg = await images_add_in_messages(reasoner_messages, images,settings)
                    if vendor == 'Ollama':
                        if settings['reasoner']['temperature'] !=1:
                            reasoner_extra['temperature'] = settings['reasoner']['temperature']

                        # 流式调用推理模型
                        reasoner_stream = await reasoner_client.chat.completions.create(
                            model=settings['reasoner']['model'],
                            messages=msg,
                            stream=True,
                            **reasoner_extra
                        )
                        full_reasoning = ""
                        buffer = ""  # 跨chunk的内容缓冲区
                        in_reasoning = False  # 是否在标签内
                        
                        async for chunk in reasoner_stream:
                            if not chunk.choices:
                                continue
                            chunk_dict = chunk.model_dump()
                            delta = chunk_dict["choices"][0].get("delta", {})
                            if delta:
                                current_content = delta.get("content", "")
                                buffer += current_content  # 累积到缓冲区
                                
                                # 实时处理缓冲区内容
                                while True:
                                    reasoning_content = delta.get("reasoning_content", "")
                                    if reasoning_content:
                                        full_reasoning += reasoning_content
                                    else:
                                        reasoning_content = delta.get("reasoning", "")
                                        if reasoning_content:
                                            delta['reasoning_content'] = reasoning_content
                                            full_reasoning += reasoning_content
                                    if reasoning_content:
                                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                                        break
                                    if not in_reasoning:
                                        # 寻找开放标签
                                        start_pos = buffer.find(open_tag)
                                        if start_pos != -1:
                                            # 开放标签前的内容（非思考内容）
                                            non_reasoning = buffer[:start_pos]
                                            buffer = buffer[start_pos+len(open_tag):]
                                            in_reasoning = True
                                        else:
                                            break  # 无开放标签，保留后续处理
                                    else:
                                        # 寻找闭合标签
                                        end_pos = buffer.find(close_tag)
                                        if end_pos != -1:
                                            # 提取思考内容并构造响应
                                            reasoning_part = buffer[:end_pos]
                                            chunk_dict["choices"][0]["delta"] = {
                                                "reasoning_content": reasoning_part,
                                                "content": ""  # 清除非思考内容
                                            }
                                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                                            full_reasoning += reasoning_part
                                            buffer = buffer[end_pos+len(close_tag):]
                                            in_reasoning = False
                                        else:
                                            # 发送未闭合的中间内容
                                            if buffer:
                                                chunk_dict["choices"][0]["delta"] = {
                                                    "reasoning_content": buffer,
                                                    "content": ""
                                                }
                                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                full_reasoning += buffer
                                                buffer = ""
                                            break  # 等待更多内容
                    else:
                        if settings['reasoner']['temperature'] !=1:
                            reasoner_extra['temperature'] = settings['reasoner']['temperature']
                        # 流式调用推理模型
                        reasoner_stream = await reasoner_client.chat.completions.create(
                            model=settings['reasoner']['model'],
                            messages=msg,
                            stream=True,
                            stop=settings['reasoner']['stop_words'],
                            **reasoner_extra
                        )
                        full_reasoning = ""
                        # 处理推理模型的流式响应
                        async for chunk in reasoner_stream:
                            if not chunk.choices:
                                continue

                            chunk_dict = chunk.model_dump()
                            delta = chunk_dict["choices"][0].get("delta", {})
                            if delta:
                                reasoning_content = delta.get("reasoning_content", "")
                                if reasoning_content:
                                    full_reasoning += reasoning_content
                                else:
                                    reasoning_content = delta.get("reasoning", "")
                                    if reasoning_content:
                                        delta['reasoning_content'] = reasoning_content
                                        full_reasoning += reasoning_content
                                # 移除content字段，确保yield的内容中不包含content
                                if 'content' in delta:
                                    del delta['content']
                            yield f"data: {json.dumps(chunk_dict)}\n\n"

                    # 在推理结束后添加完整推理内容到消息
                    content_append(request.messages, 'assistant', f"<think>\n{full_reasoning}\n</think>")  # 可参考的推理过程
                # 状态跟踪变量
                in_reasoning = False
                reasoning_buffer = []
                content_buffer = []
                if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    content_append(request.messages, 'user',  f"\n\n可参考的步骤：{user_prompt}\n\n")
                    drs_msg = get_drs_stage(DRS_STAGE)
                    if drs_msg:
                        content_append(request.messages, 'user',  f"\n\n{drs_msg}\n\n")
                msg = await images_add_in_messages(request.messages, images,settings)
                if request.top_p != 1 or settings['top_p'] != 1:
                    extra['top_p'] = request.top_p or settings['top_p']

                if settings['temperature'] !=1:
                    extra['temperature'] = settings['temperature']

                if tools:
                    extra['tools'] = tools

                response = await client.chat.completions.create(
                    model=model,
                    messages=msg,  # 添加图片信息到消息
                    stream=True,
                    stream_options={"include_usage": True},
                    extra_body = extra_params, # 其他参数
                    **extra
                )

                tool_calls = []
                full_content = ""
                assistant_reasoning_content = "" 
                search_not_done = False
                search_task = ""
                is_tool_call = False
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    if choice.delta.tool_calls:  # function_calling
                        is_tool_call = True
                        for tool in choice.delta.tool_calls:
                            idx = getattr(tool, 'index', len(tool_calls))
                            while len(tool_calls) <= idx:
                                tool_calls.append(None)
                            
                            if tool_calls[idx] is None:
                                tool_calls[idx] = tool
                            else:
                                if tool.function and tool.function.arguments:
                                    # function参数为流式响应，需要拼接
                                    if tool_calls[idx].function.arguments:
                                        tool_calls[idx].function.arguments += tool.function.arguments
                                    else:
                                        tool_calls[idx].function.arguments = tool.function.arguments
                            current_tool = tool_calls[idx]
                            if current_tool.function and current_tool.function.name:
                                progress_chunk = {
                                    "choices": [{
                                        "delta": {
                                            "tool_progress": {  # 新增字段，区别于最终的 tool_content
                                                "name": current_tool.function.name,
                                                "arguments": current_tool.function.arguments or "",
                                                "index": idx,
                                                "id": current_tool.id or f"call_{idx}"
                                            }
                                        }
                                    }]
                                }
                                yield f"data: {json.dumps(progress_chunk)}\n\n"
                    else:
                        if hasattr(choice.delta, "audio") and choice.delta.audio and is_tool_call == False:
                            # 只把 Base64 音频数据留在 delta 里，别动它
                            yield f"data: {chunk.model_dump_json()}\n\n"
                            continue
                        elif hasattr(choice.delta, "audio") and choice.delta.audio and is_tool_call == True:
                            continue
                        # 创建原始chunk的拷贝
                        chunk_dict = chunk.model_dump()
                        delta = chunk_dict["choices"][0]["delta"]
                        
                        # 初始化必要字段
                        delta.setdefault("content", "")
                        delta.setdefault("reasoning_content", "")
                        
                        # 优先处理 reasoning_content
                        if delta["reasoning_content"]:
                            assistant_reasoning_content += delta["reasoning_content"]  # 新增
                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                            continue
                        if delta.get("reasoning", ""):
                            delta["reasoning_content"] = delta["reasoning"]
                            assistant_reasoning_content += delta["reasoning_content"]  # 新增
                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                            continue

                        # 处理内容
                        current_content = delta["content"]
                        buffer = current_content
                        
                        while buffer:
                            if not in_reasoning:
                                # 寻找开始标签
                                start_pos = buffer.find(open_tag)
                                if start_pos != -1:
                                    # 处理开始标签前的内容
                                    content_buffer.append(buffer[:start_pos])
                                    buffer = buffer[start_pos+len(open_tag):]
                                    in_reasoning = True
                                else:
                                    content_buffer.append(buffer)
                                    buffer = ""
                            else:
                                # 寻找结束标签
                                end_pos = buffer.find(close_tag)
                                if end_pos != -1:
                                    # 处理思考内容
                                    reasoning_buffer.append(buffer[:end_pos])
                                    buffer = buffer[end_pos+len(close_tag):]
                                    in_reasoning = False
                                else:
                                    reasoning_buffer.append(buffer)
                                    buffer = ""
                        
                        # 构造新的delta内容
                        new_content = "".join(content_buffer)
                        new_reasoning = "".join(reasoning_buffer)
                        
                        assistant_reasoning_content += new_reasoning  # 新增

                        # 更新chunk内容
                        delta["content"] = new_content.strip("\x00")  # 保留未完成内容
                        delta["reasoning_content"] = new_reasoning.strip("\x00") or None
                        
                        # 重置缓冲区但保留未完成部分
                        if in_reasoning:
                            content_buffer = [new_content.split(open_tag)[-1]] 
                        else:
                            content_buffer = []
                        reasoning_buffer = []
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        full_content += delta.get("content") or "" 
                # 最终flush未完成内容
                if content_buffer or reasoning_buffer:
                    final_chunk = {
                        "choices": [{
                            "delta": {
                                "content": "".join(content_buffer),
                                "reasoning_content": "".join(reasoning_buffer)
                            }
                        }]
                    }
                    yield f"data: {json.dumps(final_chunk)}\n\n"
                    full_content += final_chunk["choices"][0]["delta"].get("content", "")
                if settings.get("systemSettings", {}).get("contentSafety", False) and full_content:
                    is_safe, matched = await check_content_safety(full_content, min_cjk_chars=3)
                    if not is_safe:
                        print(f"[content_safety] output blocked words: {matched}")
                        correction = {"choices": [{"delta": {"content": "[该回复已被内容安全策略自动替换]", "_safety_filtered": True}}]}
                        yield f"data: {json.dumps(correction)}\n\n"
                        full_content = "[该回复已被内容安全策略自动替换]"
                if not tool_calls:
                    # 将响应添加到消息列表
                    request.messages.append({
                        "role": "assistant",
                        "content": full_content,
                        "reasoning_content": assistant_reasoning_content
                    })
                    assistant_reasoning_content = ""  # 重置
                # 工具和深度搜索
                if tool_calls:
                    print("tool_calls",tool_calls)
                    pass
                elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content)
                    response = await client.chat.completions.create(
                        model=model,
                        messages=[
                            {
                            "role": "system",
                            "content": source_prompt,
                            },
                            {
                            "role": "user",
                            "content": search_prompt,
                            }
                        ],
                        extra_body = extra_params, # 其他参数
                    )
                    response_content = response.choices[0].message.content
                    # 用re 提取```json 包裹json字符串 ```
                    if "```json" in response_content:
                        try:
                            response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                        except:
                            # 用re 提取```json 之后的内容
                            response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                    try:
                        response_content = json.loads(response_content)
                    except json.JSONDecodeError:
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❌{await t('task_error')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                    if response_content["status"] == "done":
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                   "tool_content": {"title": f"✅{await t('task_done')}", "content": ""},
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = False
                    elif response_content["status"] == "not_done":
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❎{await t('task_not_done')}", "content": ""},
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        search_task = response_content["unfinished_task"]
                        task_prompt = f"请继续完成初始任务中未完成的任务：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n最后，请给出完整的初始任务的最终结果。"
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # 本轮思考已归档
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": task_prompt,
                            }
                        )
                    elif response_content["status"] == "need_more_info":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❓{await t('task_need_more_info')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = False
                    elif response_content["status"] == "need_work":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"🔍{await t('enter_search_stage')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        drs_msg = get_drs_stage(DRS_STAGE)
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        request.messages.append(
                            {
                                "role": "user",
                                "content": drs_msg,
                            }
                        )
                    elif response_content["status"] == "need_more_work":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"🔍{await t('need_more_work')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        search_task = response_content["unfinished_task"]
                        task_prompt = f"请继续查询如下信息：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n"
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # 本轮思考已归档
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": task_prompt,
                            }
                        )
                    elif response_content["status"] == "answer":
                        DRS_STAGE = 3
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"⭐{await t('enter_answer_stage')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        drs_msg = get_drs_stage(DRS_STAGE)
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # 本轮思考已归档
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": drs_msg,
                            }
                        )

                reasoner_messages = copy.deepcopy(request.messages)
                while tool_calls or search_not_done:
                    full_content = ""
                    if tool_calls:
                        # 1. 组装并保存 assistant 消息中的 tool_calls 列表
                        assistant_tool_calls_msg = {
                            "role": "assistant",
                            "content": "",
                            "reasoning_content": assistant_reasoning_content,
                            "tool_calls": []
                        }
                        assistant_reasoning_content = ""  # 重置，本轮思考已存入
                        assistant_tool_calls_str =[]
                        
                        for tc in tool_calls:
                            if tc is None: continue
                            response_content = tc.function
                            assistant_tool_calls_msg["tool_calls"].append({
                                "id": tc.id,
                                "function": {
                                    "arguments": response_content.arguments,
                                    "name": response_content.name,
                                },
                                "type": tc.type,
                            })
                            assistant_tool_calls_str.append(str(response_content))
                        
                        request.messages.append(assistant_tool_calls_msg)
                        reasoner_messages.append({
                            "role": "assistant",
                            "content": "\n".join(assistant_tool_calls_str),
                            "reasoning_content": "",
                        })

                        has_approval_required = False
                        
                        # 2. 依次执行各个并行工具调用
                        for tc in tool_calls:
                            if tc is None: continue
                            response_content = tc.function
                            
                            # 兼容大模型将多个 JSON 参数拼接在一个工具参数里的边缘情况
                            modified_data = '[' + response_content.arguments.replace('}{', '},{') + ']'
                            try:
                                data_list = json.loads(modified_data)
                            except:
                                try:
                                    data_list = [json.loads(response_content.arguments)]
                                except:
                                    data_list = [{}]
                            
                            if not isinstance(data_list, list):
                                data_list = [data_list]
                            if len(data_list) == 0:
                                data_list = [{}]

                            # 【修复 1】显式发送 "call" 事件，锁定 UI 状态并同步 ID
                            call_confirm_chunk = {
                                "choices":[{
                                    "delta": {
                                        "tool_call_id": tc.id,
                                        "tool_content": {
                                            "title": response_content.name,
                                            "content": response_content.arguments, # 发送完整参数给前端渲染
                                            "type": "call"
                                        }
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(call_confirm_chunk)}\n\n"

                            all_results_for_this_call =[]
                            is_streaming_result = False

                            # 遍历内部参数列表执行工具（绝大多数情况 data_list 长度为 1）
                            for arg_item in data_list:
                                if settings['tools']['asyncTools']['enabled']:
                                    tool_id = uuid.uuid4()
                                    async_tool_id = f"{response_content.name}_{tool_id}"
                                    chunk_dict = {
                                        "id": "agentParty",
                                        "choices":[
                                            {
                                                "finish_reason": None,
                                                "index": 0,
                                                "delta": {
                                                    "role": "assistant",
                                                    "content": "",
                                                    "async_tool_id": async_tool_id
                                                }
                                            }
                                        ]
                                    }
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    asyncio.create_task(
                                        execute_tool(
                                            async_tool_id,
                                            response_content.name,
                                            arg_item,
                                            settings,
                                            user_prompt
                                        )
                                    )
                                    async with async_tools_lock:
                                        async_tools[async_tool_id] = {
                                            "status": "pending",
                                            "result": None,
                                            "name": response_content.name,
                                            "parameters": arg_item
                                        }
                                    res = f"{response_content.name}tool has been successfully launched. It will take some time to run, and the results will be provided in the next round of conversation."
                                    all_results_for_this_call.append(res)
                                else:
                                    _tool_task = asyncio.create_task(dispatch_tool(response_content.name, arg_item, settings, request.is_sub_agent))
                                    while True:
                                        _done, _ = await asyncio.wait([_tool_task], timeout=30)
                                        if _tool_task in _done:
                                            res = _tool_task.result()
                                            break
                                        _heartbeat = {"choices": [{"delta": {"tool_heartbeat": {"name": response_content.name}}}]}
                                        yield f"data: {json.dumps(_heartbeat)}\n\n"

                                    if res is None:
                                        chunk = {
                                            "id": "extra_tools",
                                            "choices":[
                                                {
                                                    "index": 0,
                                                    "delta": {
                                                        "role":"assistant",
                                                        "content": "",
                                                        "tool_calls": response_content.arguments,
                                                    }
                                                }
                                            ]
                                        }
                                        yield f"data: {json.dumps(chunk)}\n\n"
                                        continue

                                    if response_content.name in["query_knowledge_base"] and type(res) == list:
                                        if settings["KBSettings"]["is_rerank"]:
                                            res = await rerank_knowledge_base(user_prompt, res)
                                        res = json.dumps(res, ensure_ascii=False, indent=4)
                                    
                                    # 处理流式工具结果
                                    if isinstance(res, AsyncIterator):
                                        is_streaming_result = True
                                        buffer =[]
                                        first = True
                                        async for chunk in res:
                                            buffer.append(chunk)
                                            if first:
                                                stream_chunk = {
                                                    "choices":[{
                                                        "delta": {
                                                            "tool_call_id": tc.id,
                                                            "tool_content": {
                                                                "title": response_content.name,
                                                                "content": chunk,
                                                                "type": "tool_result_stream"
                                                            }
                                                        }
                                                    }]
                                                }
                                                yield f"data: {json.dumps(stream_chunk)}\n\n"
                                                first = False
                                            else:
                                                stream_chunk = {
                                                    "choices":[{
                                                        "delta": {
                                                            "tool_call_id": tc.id,
                                                            "tool_content": {
                                                                "title": "tool_result_stream",
                                                                "content": chunk,
                                                                "type": "tool_result_stream"
                                                            }
                                                        }
                                                    }]
                                                }
                                                yield f"data: {json.dumps(stream_chunk)}\n\n"
                                        res = "".join(buffer)

                                    if isinstance(res, str) and '"approval_required"' in res:
                                        try:
                                            parsed_res = json.loads(res)
                                            if parsed_res.get("type") == "approval_required":
                                                has_approval_required = True
                                        except Exception:
                                            pass
                                        
                                    all_results_for_this_call.append(str(res))

                            if len(all_results_for_this_call) == 0:
                                combined_results = "None"
                            elif len(all_results_for_this_call) == 1:
                                combined_results = all_results_for_this_call[0]
                            else:
                                combined_results = "\n\n".join(all_results_for_this_call)
                            
                            # 【修复 2】发送组合后的结果 (非流式情况下)
                            if not is_streaming_result:
                                result_chunk = {
                                    "choices":[{
                                        "delta": {
                                            "tool_call_id": tc.id,
                                            "tool_content": {
                                                "title": response_content.name,
                                                "content": combined_results,
                                                "type": "tool_result"
                                            }
                                        }
                                    }]
                                }
                                yield f"data: {json.dumps(result_chunk)}\n\n"

                            request.messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "name": response_content.name,
                                    "content": str(combined_results),
                                }
                            )
                            reasoner_messages.append(
                                {
                                    "role": "user",
                                    "content": f"{response_content.name}工具结果：{combined_results}",
                                    "reasoning_content": "",
                                }
                            )
                    # 如果启用推理模型
                    if settings['reasoner']['enabled'] or enable_thinking:
                        if tools:
                            content_append(reasoner_messages, 'system',  f"可用工具：{json.dumps(tools)}")
                        for modelProvider in settings['modelProviders']: 
                            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                                vendor = modelProvider['vendor']
                                break
                        msg = await images_add_in_messages(reasoner_messages, images,settings)
                        if vendor == 'Ollama':
                            if settings['reasoner']['temperature'] !=1:
                                reasoner_extra['temperature'] = settings['reasoner']['temperature']
                            # 流式调用推理模型
                            reasoner_stream = await reasoner_client.chat.completions.create(
                                model=settings['reasoner']['model'],
                                messages=msg,
                                stream=True,
                                **reasoner_extra
                            )
                            full_reasoning = ""
                            buffer = ""  # 跨chunk的内容缓冲区
                            in_reasoning = False  # 是否在标签内
                            
                            async for chunk in reasoner_stream:
                                if not chunk.choices:
                                    continue
                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0].get("delta", {})
                                if delta:
                                    current_content = delta.get("content", "")
                                    buffer += current_content  # 累积到缓冲区
                                    
                                    # 实时处理缓冲区内容
                                    while True:
                                        reasoning_content = delta.get("reasoning_content", "")
                                        if reasoning_content:
                                            full_reasoning += reasoning_content
                                        else:
                                            reasoning_content = delta.get("reasoning", "")
                                            if reasoning_content:
                                                delta['reasoning_content'] = reasoning_content
                                                full_reasoning += reasoning_content
                                        if reasoning_content:
                                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                                            break
                                        if not in_reasoning:
                                            # 寻找开放标签
                                            start_pos = buffer.find(open_tag)
                                            if start_pos != -1:
                                                # 开放标签前的内容（非思考内容）
                                                non_reasoning = buffer[:start_pos]
                                                buffer = buffer[start_pos+len(open_tag):]
                                                in_reasoning = True
                                            else:
                                                break  # 无开放标签，保留后续处理
                                        else:
                                            # 寻找闭合标签
                                            end_pos = buffer.find(close_tag)
                                            if end_pos != -1:
                                                # 提取思考内容并构造响应
                                                reasoning_part = buffer[:end_pos]
                                                chunk_dict["choices"][0]["delta"] = {
                                                    "reasoning_content": reasoning_part,
                                                    "content": ""  # 清除非思考内容
                                                }
                                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                full_reasoning += reasoning_part
                                                buffer = buffer[end_pos+len(close_tag):]
                                                in_reasoning = False
                                            else:
                                                # 发送未闭合的中间内容
                                                if buffer:
                                                    chunk_dict["choices"][0]["delta"] = {
                                                        "reasoning_content": buffer,
                                                        "content": ""
                                                    }
                                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                    full_reasoning += buffer
                                                    buffer = ""
                                                break  # 等待更多内容
                        else:
                            if settings['reasoner']['temperature'] !=1:
                                reasoner_extra['temperature'] = settings['reasoner']['temperature']

                            # 流式调用推理模型
                            reasoner_stream = await reasoner_client.chat.completions.create(
                                model=settings['reasoner']['model'],
                                messages=msg,
                                stream=True,
                                stop=settings['reasoner']['stop_words'],
                                **reasoner_extra
                            )
                            full_reasoning = ""
                            # 处理推理模型的流式响应
                            async for chunk in reasoner_stream:
                                if not chunk.choices:
                                    continue

                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0].get("delta", {})
                                if delta:
                                    reasoning_content = delta.get("reasoning_content", "")
                                    if reasoning_content:
                                        full_reasoning += reasoning_content
                                    else:
                                        reasoning_content = delta.get("reasoning", "")
                                        if reasoning_content:
                                            delta['reasoning_content'] = reasoning_content
                                            full_reasoning += reasoning_content
                                    # 移除content字段，确保yield的内容中不包含content
                                    if 'content' in delta:
                                        del delta['content']
                                yield f"data: {json.dumps(chunk_dict)}\n\n"

                        # 在推理结束后添加完整推理内容到消息
                        content_append(request.messages, 'user', f"\n\n可参考的推理过程：{full_reasoning}") # 可参考的推理过程

                    all_combined_results = ""
                    if tool_calls:
                        # 统计非 None 的 tool_calls 数量
                        tool_msg_count = sum(1 for tc in tool_calls if tc is not None)
                        if tool_msg_count > 0:
                            # 提取 request.messages 最后新加进去的工具返回结果，并将它们拼接在一起
                            recent_tool_msgs = request.messages[-tool_msg_count:]
                            all_combined_results = "\n".join([str(msg.get("content", "")) for msg in recent_tool_msgs if msg.get("role") == "tool"])

                    browser_vision_enabled = False
                    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
                        browser_vision_enabled = settings['chromeMCPSettings'].get('browserVision', False)

                    if browser_vision_enabled and '[Getting browser screenshot]' in all_combined_results:
                        import re
                        # 使用正则提取返回值中的 URL (例如: http://127.0.0.1:3456/uploaded_files/xxx.jpg)
                        match = re.search(r'\[Getting browser screenshot\]\s*(http[^\s]+)', all_combined_results)
                        if match:
                            browser_img_url = match.group(1)
                            
                            current_browser_msg = {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": "[Getting browser screenshot]\n\n【system info】Current browser screenshot injected."},
                                    {"type": "image_url", "image_url": {"url": browser_img_url}}
                                ]
                            }
                            request.messages.append(current_browser_msg)
                            
                            # (可选) 清理旧的浏览器截图，节约 Token 消耗
                            if settings.get('chromeMCPSettings', {}).get('onlyNewScreen', True):
                                for msg in request.messages[:-1]:
                                    if isinstance(msg.get('content'), list):
                                        # 过滤掉旧的图片项
                                        msg['content'] =[item for item in msg['content'] if item.get('type') != 'image_url']
                                        # 如果过滤后只剩下 text，直接还原为普通字符串
                                        if len(msg['content']) == 1 and msg['content'][0].get('type') == 'text':
                                            msg['content'] = msg['content'][0]['text']
                                        elif len(msg['content']) == 0:
                                            msg['content'] = ""


                    vision_control_enabled = settings.get('visionControlSettings', {}).get('enabled', False)
                    
                    # === 修改点：将原来绝对匹配 results 修改为判断包含在 all_combined_results 中 ===
                    if vision_control_enabled and ('[Getting screenshot]' in all_combined_results or settings.get('visionControlSettings', {}).get('desktopVision', False)):
                        try:
                            import pyautogui
                            # 必须从你的工具类中引入设置区域的方法
                            from py.computer_use_tool import set_screen_region
                            # 引入编写好的跨平台 UI 树抓取工具
                            from py.ui_tree_helper import get_desktop_ui_tree
                            
                            v_settings = settings.get('visionControlSettings', {})
                            is_grid_enabled = v_settings.get('isEnableGrid', False)
                            is_full_screen = v_settings.get('isFullScreen', True)
                            # ScreenSize 格式为 [x, y, width, height]
                            screen_size = v_settings.get('ScreenSize',[0, 0, 1920, 1080])
                            time.sleep(0.5) # 等待一下，确保截图工具已经准备好
                            print(f"正在执行桌面截图 (全屏: {is_full_screen}, 网格: {is_grid_enabled})...")
                            
                            # 初始化坐标偏移量
                            offset_x, offset_y = 0, 0
                            
                            # --- 1. 区域判定与捕获 ---
                            if not is_full_screen and len(screen_size) == 4:
                                # 局部截图模式
                                rx, ry, rw, rh = map(int, screen_size)
                                offset_x, offset_y = rx, ry  # 记录局部截图的左上角坐标偏移
                                
                                # 关键：告诉鼠标工具，接下来的 0-1000 坐标要映射到这个局部矩形
                                set_screen_region((rx, ry, rw, rh))
                                
                                # 逻辑尺寸即为选区尺寸
                                logical_width, logical_height = rw, rh
                                # 捕获指定区域
                                screenshot = await asyncio.to_thread(pyautogui.screenshot, region=(rx, ry, rw, rh))
                            else:
                                # 全屏截图模式
                                set_screen_region(None) # 恢复全屏映射
                                logical_width, logical_height = pyautogui.size()
                                screenshot = await asyncio.to_thread(pyautogui.screenshot)
                            
                            # --- 2. 强制 Resize 到逻辑坐标系 (解决 Windows 缩放偏移) ---
                            if screenshot.width != logical_width or screenshot.height != logical_height:
                                screenshot = await asyncio.to_thread(
                                    screenshot.resize, (logical_width, logical_height), Image.Resampling.LANCZOS
                                )
                            
                            # 限制传输图片大小，平衡 Token 消耗
                            target_w, target_h = scale_to_fit(logical_width, logical_height, 1280, 720)
                            if screenshot.width > target_w or screenshot.height > target_h:
                                screenshot = await asyncio.to_thread(
                                    screenshot.resize, (target_w, target_h), Image.Resampling.LANCZOS
                                )

                            # --- 3. 绘制视觉反馈 (红点/线) ---
                            action_feedback_hint = ""
                            
                            # === 修改点：使用 all_combined_results 替代原来的 results ===
                            if all_combined_results and "[LAST_ACTION:" in all_combined_results:
                                screenshot = await asyncio.to_thread(draw_action_feedback, screenshot, all_combined_results)
                                action_feedback_hint = (
                                    " Notice: The colored markers show your PREVIOUS actions relative to this view. "
                                    "Cyan = Click. Blue = Double Click. Green-Yellow = Drag."
                                )

                            # --- 4. 绘制网格辅助 ---
                            if is_grid_enabled:
                                display_image = await asyncio.to_thread(draw_grid_on_image, screenshot.copy(), grid_spacing=10)
                                region_text = "partial region" if not is_full_screen else "full desktop"
                                grid_hint = f"\n\n【system info】Screenshot of {region_text} with coordinate grid (0-1000) injected. Use coordinates for precise clicking within this view.\n{action_feedback_hint}"
                            else:
                                display_image = screenshot
                                grid_hint = f"\n\n【system info】Current screenshot injected.\n{action_feedback_hint}"

                            ui_tree_hint = ""
                            if vision_control_enabled:
                                print("正在异步提取跨平台无障碍 UI 树并进行 0-1000 坐标对齐...")
                                # 传入逻辑视口尺寸 (logical_width, logical_height) 和 偏移量 (offset_x, offset_y)
                                ui_tree_json = await get_desktop_ui_tree(
                                    logical_width=logical_width,
                                    logical_height=logical_height,
                                    offset_x=offset_x,
                                    offset_y=offset_y
                                )
                                ui_tree_hint = f"\n\n【system info】Current Interactive UI Elements (Index of clickable items on screen with 0-1000 grid):\n```json\n{ui_tree_json}\n```\nYou can click any element using the provided [center_x, center_y] coordinates (which correspond perfectly to your 0-1000 grid input)."

                            # --- 5. 保存并注入消息 ---
                            desktop_img_name = f"desktop_view_{uuid.uuid4().hex}.png"
                            desktop_img_path = os.path.join(UPLOAD_FILES_DIR, desktop_img_name)
                            await asyncio.to_thread(display_image.save, desktop_img_path, optimize=True)
                            
                            desktop_url = f"{fastapi_base_url}uploaded_files/{desktop_img_name}"
                            
                            # 将 grid_hint 与 ui_tree_hint 合并到消息的文本节点中
                            current_user_msg = {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": '[Getting screenshot]' + grid_hint + ui_tree_hint},
                                    {"type": "image_url", "image_url": {"url": desktop_url}}
                                ]
                            }
                            request.messages.append(current_user_msg)
                            
                            # --- 6. 清理旧截图 ---
                            if v_settings.get('onlyNewScreen', False):
                                for msg in request.messages[:-1]:
                                    if isinstance(msg.get('content'), list):
                                        msg['content'] = [item for item in msg['content'] if item.get('type') != 'image_url']
                                        if len(msg['content']) == 1 and msg['content'][0].get('type') == 'text':
                                            msg['content'] = msg['content'][0]['text']
                                        elif len(msg['content']) == 0:
                                            msg['content'] = ""

                        except Exception as e:
                            print(f"后端桌面截图或获取 UI 树失败: {e}")
                            
                        images = await images_in_messages(request.messages, fastapi_base_url)
                        request.messages = await message_without_images(request.messages)
                    msg = await images_add_in_messages(request.messages, images, settings)
                    if request.top_p != 1 or settings['top_p'] != 1:
                        extra['top_p'] = request.top_p or settings['top_p']

                    if settings['temperature'] !=1:
                        extra['temperature'] = settings['temperature']

                    if tools:
                        extra['tools'] = tools
                    response = await client.chat.completions.create(
                        model=model,
                        messages=msg,  # 添加图片信息到消息
                        stream=True,
                        stream_options={"include_usage": True},
                        extra_body = extra_params, # 其他参数
                        **extra
                    )
                    tool_calls = []
                    async for chunk in response:
                        if not chunk.choices:
                            continue
                        if chunk.choices:
                            choice = chunk.choices[0]
                            if hasattr(choice.delta, "audio") and choice.delta.audio:
                                # 只把 Base64 音频数据留在 delta 里，别动它
                                yield f"data: {chunk.model_dump_json()}\n\n"
                                continue
                            if choice.delta.tool_calls:  # function_calling
                                for tool in choice.delta.tool_calls:
                                    idx = getattr(tool, 'index', len(tool_calls))
                                    while len(tool_calls) <= idx:
                                        tool_calls.append(None)
                                    
                                    if tool_calls[idx] is None:
                                        tool_calls[idx] = tool
                                    else:
                                        if tool.function and tool.function.arguments:
                                            # function参数为流式响应，需要拼接
                                            if tool_calls[idx].function.arguments:
                                                tool_calls[idx].function.arguments += tool.function.arguments
                                            else:
                                                tool_calls[idx].function.arguments = tool.function.arguments
                                current_tool = tool_calls[idx]
                                if current_tool.function and current_tool.function.name:
                                    progress_chunk = {
                                        "choices": [{
                                            "delta": {
                                                "tool_progress": {  # 新增字段，区别于最终的 tool_content
                                                    "name": current_tool.function.name,
                                                    "arguments": current_tool.function.arguments or "",
                                                    "index": idx,
                                                    "id": current_tool.id or f"call_{idx}"
                                                }
                                            }
                                        }]
                                    }
                                    yield f"data: {json.dumps(progress_chunk)}\n\n"
                            else:
                                # 创建原始chunk的拷贝
                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0]["delta"]
                                
                                # 初始化必要字段
                                delta.setdefault("content", "")
                                delta.setdefault("reasoning_content", "")

                                # 优先处理 reasoning_content
                                if delta["reasoning_content"]:
                                    assistant_reasoning_content += delta["reasoning_content"]  # 新增
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    continue
                                if delta.get("reasoning", ""):
                                    delta["reasoning_content"] = delta["reasoning"]
                                    assistant_reasoning_content += delta["reasoning_content"]  # 新增
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    continue
                                # 处理内容
                                current_content = delta["content"]
                                buffer = current_content
                                
                                while buffer:
                                    if not in_reasoning:
                                        # 寻找开始标签
                                        start_pos = buffer.find(open_tag)
                                        if start_pos != -1:
                                            # 处理开始标签前的内容
                                            content_buffer.append(buffer[:start_pos])
                                            buffer = buffer[start_pos+len(open_tag):]
                                            in_reasoning = True
                                        else:
                                            content_buffer.append(buffer)
                                            buffer = ""
                                    else:
                                        # 寻找结束标签
                                        end_pos = buffer.find(close_tag)
                                        if end_pos != -1:
                                            # 处理思考内容
                                            reasoning_buffer.append(buffer[:end_pos])
                                            buffer = buffer[end_pos+len(close_tag):]
                                            in_reasoning = False
                                        else:
                                            reasoning_buffer.append(buffer)
                                            buffer = ""
                                
                                # 构造新的delta内容
                                new_content = "".join(content_buffer)
                                new_reasoning = "".join(reasoning_buffer)

                                assistant_reasoning_content += new_reasoning
                                
                                # 更新chunk内容
                                delta["content"] = new_content.strip("\x00")  # 保留未完成内容
                                delta["reasoning_content"] = new_reasoning.strip("\x00") or None
                                
                                # 重置缓冲区但保留未完成部分
                                if in_reasoning:
                                    content_buffer = [new_content.split(open_tag)[-1]] 
                                else:
                                    content_buffer = []
                                reasoning_buffer = []
                                
                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                full_content += delta.get("content") or "" 
                    # 最终flush未完成内容
                    if content_buffer or reasoning_buffer:
                        final_chunk = {
                            "choices": [{
                                "delta": {
                                    "content": "".join(content_buffer),
                                    "reasoning_content": "".join(reasoning_buffer)
                                }
                            }]
                        }
                        yield f"data: {json.dumps(final_chunk)}\n\n"
                        full_content += final_chunk["choices"][0]["delta"].get("content", "")
                    if settings.get("systemSettings", {}).get("contentSafety", False) and full_content:
                        is_safe, matched = await check_content_safety(full_content, min_cjk_chars=3)
                        if not is_safe:
                            print(f"[content_safety] output blocked words: {matched}")
                            correction = {"choices": [{"delta": {"content": "[该回复已被内容安全策略自动替换]", "_safety_filtered": True}}]}
                            yield f"data: {json.dumps(correction)}\n\n"
                            full_content = "[该回复已被内容安全策略自动替换]"
                    if not tool_calls:
                        # 将响应添加到消息列表
                        request.messages.append({
                            "role": "assistant",
                            "content": full_content,
                            "reasoning_content": assistant_reasoning_content
                        })
                        assistant_reasoning_content = ""  # 重置
                    # 工具和深度搜索
                    if tool_calls:
                        pass
                    elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                        search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content)
                        response = await client.chat.completions.create(
                            model=model,
                            messages=[                        
                                {
                                "role": "system",
                                "content": source_prompt,
                                },
                                {
                                "role": "user",
                                "content": search_prompt,
                                }
                            ],
                            extra_body = extra_params, # 其他参数
                        )
                        response_content = response.choices[0].message.content
                        if response_content is None:
                            response_content = ""
                        # 用re 提取```json 包裹json字符串 ```
                        if "```json" in response_content:
                            try:
                                response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                            except:
                                # 用re 提取```json 之后的内容
                                response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                        try:
                            response_content = json.loads(response_content)
                        except json.JSONDecodeError:
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❌{await t('task_error')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                        if response_content["status"] == "done":
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"✅{await t('task_done')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = False
                        elif response_content["status"] == "not_done":
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❎{await t('task_not_done')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            search_task = response_content["unfinished_task"]
                            task_prompt = f"请继续完成初始任务中未完成的任务：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n最后，请给出完整的初始任务的最终结果。"
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # 本轮思考已归档
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": task_prompt,
                                }
                            )
                        elif response_content["status"] == "need_more_info":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❓{await t('task_need_more_info')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = False
                        elif response_content["status"] == "need_work":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"🔍{await t('enter_search_stage')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            drs_msg = get_drs_stage(DRS_STAGE)
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # 本轮思考已归档
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": drs_msg,
                                }
                            )
                        elif response_content["status"] == "need_more_work":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"🔍{await t('need_more_work')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            search_task = response_content["unfinished_task"]
                            task_prompt = f"请继续查询如下信息：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n"
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # 本轮思考已归档
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": task_prompt,
                                }
                            )
                        elif response_content["status"] == "answer":
                            DRS_STAGE = 3
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"⭐{await t('enter_answer_stage')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            drs_msg = get_drs_stage(DRS_STAGE)
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # 本轮思考已归档
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": drs_msg,
                                }
                            )
                logger.info(f"all msg: {request.messages}")
                yield "data: [DONE]\n\n"
                if settings.get('loveSettings', {}).get('enabled', False) and not request.is_sub_agent:
                    try:
                        from py.affection_system import extract_and_update_affection
                        # full_content 是当前轮次 AI 的完整回复文本
                        await extract_and_update_affection(full_content)
                    except Exception as e:
                        print(f"解析好感度标签出错: {e}")
                # ========== 对话缓冲：记录助手回复用于闲时自动总结 ==========
                try:
                    diary_settings_inner = (settings.get("diarySettings", {}) or {})
                    if diary_settings_inner.get("enabled", False) and diary_settings_inner.get("chatSummary", {}).get("enabled", True):
                        ms = (settings or {}).get("memorySettings", {}) or {}
                        buffer_key = ms.get("selectedMemory") or DIARY_DEFAULT_BOOK
                        if full_content:
                            append_to_chat_buffer(buffer_key, "assistant", full_content)
                except Exception as e:
                    print(f"[DiaryBuffer] 记录助手回复失败: {e}")
                if m0 and not request.is_sub_agent:
                    print("记忆更新任务开始提交")
                    messages = f"用户说：{user_prompt}\n\n---\n\n你说：{full_content}"
                    infer = cur_memory.get('infer', False) or False
                    
                    def run_task():
                        import asyncio  # ← 在这里导入！
                        import traceback
                        
                        async def add():
                            loop = asyncio.get_running_loop()
                            with ThreadPoolExecutor() as executor:
                                metadata = {
                                    "timetamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                }
                                func = partial(m0.add, user_id=memoryId, metadata=metadata, infer=infer)
                                await loop.run_in_executor(executor, func, messages)
                                print("记忆更新完成")
                        
                        try:
                            loop = asyncio.get_running_loop()
                            task = asyncio.create_task(add())
                            task.add_done_callback(
                                lambda t: print(f"任务异常: {t.exception()}") if t.exception() else None
                            )
                        except RuntimeError:
                            # 没有运行的事件循环
                            asyncio.run(add())
                        except Exception as e:
                            print(f"run_task 异常: {e}")
                            traceback.print_exc()
                    
                    import threading
                    thread = threading.Thread(target=run_task, daemon=True)
                    thread.start()
                    print("记忆更新任务已提交到后台线程")

                return
            except Exception as e:
                logger.error(f"{request.messages}")
                # 捕获异常并返回结构化错误信息
                error_chunk = {
                    "choices": [{
                        "delta": {
                            "tool_content": {
                                "title": "❎ Error", # 统一标题
                                "content": str(e),   # 错误详情
                                "type": "error"      # 标记类型，方便前端切换样式
                            }
                        }
                    }]
                }
                yield f"data: {json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"  # 确保最终结束
                return
        
        return StreamingResponse(
            heartbeat_wrapper(stream_generator(user_prompt, DRS_STAGE, tools, images)),
            media_type="text/event-stream",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    except Exception as e:
        logger.error(f"Error occurred: {e}")
        # 如果e.status_code存在，则使用它作为HTTP状态码，否则使用500
        return JSONResponse(
            status_code=getattr(e, "status_code", 500),
            content={"error": str(e)},
        )

async def generate_complete_response(client,reasoner_client, request: ChatRequest, settings: dict,fastapi_base_url,enable_thinking,enable_deep_research,enable_web_search):
    from mem0 import Memory
    global mcp_client_list,HA_client,ChromeMCP_client,sql_client
    DRS_STAGE = 1 # 1: 明确用户需求阶段 2: 工具调用阶段 3: 生成结果阶段
    if len(request.messages) > 2:
        DRS_STAGE = 2

        # =========================================================================
        # 第一阶段：上下文压缩 (仅在达到阈值时触发，决定“保留哪些消息”)
        # =========================================================================
        max_rounds = settings.get("max_rounds", 0)
        chat_messages = request.messages # 这里的 chat_messages 包含 system
        
        if max_rounds > 0:
            
            # 区分系统消息和对话消息
            sys_msgs = [m for m in chat_messages if get_role(m) == "system"]
            dialog_msgs = [m for m in chat_messages if get_role(m) != "system"]
            
            # 设定压缩阈值：当非系统消息超过 max_rounds * 2 + 1 时开始压缩
            if len(dialog_msgs) > (max_rounds * 2 + 1):
                keep_indices = set()
                
                # 1. 总是保留第一条消息 (Anchor User Prompt)
                if len(dialog_msgs) > 0: keep_indices.add(0)
                
                # 2. 保留所有 User 消息 (User 优先策略)
                for i, m in enumerate(dialog_msgs):
                    if get_role(m) == "user": keep_indices.add(i)
                
                # 3. 保留每个 Turn 的最后一个 Assistant 消息 (最终答案)
                for i in range(len(dialog_msgs)):
                    if get_role(dialog_msgs[i]) == "assistant":
                        is_last = True
                        for j in range(i + 1, len(dialog_msgs)):
                            if get_role(dialog_msgs[j]) == "assistant":
                                is_last = False; break
                            if get_role(dialog_msgs[j]) == "user": break
                        if is_last: keep_indices.add(i)
                
                # 4. 保留最近的活跃窗口 (最近 N 条消息，确保当前工具链不被切断)
                tail_start = max(0, len(dialog_msgs) - (max_rounds * 2))
                for i in range(tail_start, len(dialog_msgs)):
                    keep_indices.add(i)
                
                # 构造初步压缩后的列表
                compressed_dialog = [dialog_msgs[i] for i in sorted(list(keep_indices))]
                chat_messages = sys_msgs + compressed_dialog
                print(f"[Context] Compressed to {len(chat_messages)} msgs.")

        final_messages = []
        pending_tool_call_ids = set()

        for msg in chat_messages:
            role = get_role(msg)
            
            if role == "tool":
                t_id = msg.get("tool_call_id") if isinstance(msg, dict) else getattr(msg, "tool_call_id", None)
                # 核心校验：如果这个 tool 消息不在我们记录的待响应 ID 列表中，直接丢弃
                if t_id and t_id in pending_tool_call_ids:
                    final_messages.append(msg)
                    pending_tool_call_ids.remove(t_id) # 匹配成功，移除
                else:
                    print(f"[Sanitizer] 丢弃孤立的 tool 消息: {t_id}")
                    continue
            
            elif role == "assistant":
                tcs = get_tcs(msg)
                if tcs:
                    # 这是一个发起工具调用的消息
                    # 暂时先存入，并记录它期望的 ID
                    current_tcs_ids = {tc.get("id") if isinstance(tc, dict) else tc.id for tc in tcs}
                    final_messages.append(msg)
                    for tid in current_tcs_ids: pending_tool_call_ids.add(tid)
                else:
                    # 普通助手回复
                    final_messages.append(msg)
            
            else:
                # user 或 system 消息，直接通过
                final_messages.append(msg)

        # 最终反向检查：如果最后一条是带 tool_calls 的 assistant，但后面没有 tool 消息
        # 我们需要移除这些 tool_calls 标记，或者直接移除该条消息（取决于业务需求）
        # 这里选择保留消息文本但清空 tool_calls，防止 API 报错
        while final_messages:
            last_msg = final_messages[-1]
            tcs = get_tcs(last_msg)
            # 如果最后一条助手消息发起了调用，但我们已经没有后续消息来填补它了
            if tcs and any( ( (tc.get("id") if isinstance(tc, dict) else tc.id) in pending_tool_call_ids ) for tc in tcs ):
                # 如果该消息有文本内容，我们抹除 tool_calls 保留文本
                # 如果没文本，就直接弹出整条消息
                content = last_msg.get("content") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")
                if content:
                    if isinstance(last_msg, dict):
                        last_msg["tool_calls"] = None
                    else:
                        setattr(last_msg, "tool_calls", None)
                    print("[Sanitizer] 抹除末尾未闭合的 tool_calls")
                    break # 处理完毕
                else:
                    final_messages.pop()
                    print("[Sanitizer] 弹出末尾无内容的孤立 tool_call 发起消息")
            else:
                break

        request.messages = final_messages
        request.messages = ensure_thinking_fields(request.messages)
        # =========================================================================

    m0 = None
    if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "":
        memoryId = settings["memorySettings"]["selectedMemory"]
        cur_memory = None
        for memory in settings["memories"]:
            if memory["id"] == memoryId:
                cur_memory = memory
                break
        if cur_memory and cur_memory["providerId"]:
            print("长期记忆启用")
            config={
                "embedder": {
                    "provider": 'openai',
                    "config": {
                        "model": cur_memory['model'],
                        "api_key": cur_memory['api_key'],
                        "openai_base_url":cur_memory["base_url"],
                        "embedding_dims":cur_memory.get("embedding_dims", 1024)
                    },
                },
                "llm": {
                    "provider": 'openai',
                    "config": {
                        "model": settings['model'],
                        "api_key": settings['api_key'],
                        "openai_base_url":settings["base_url"]
                    }
                },
                "vector_store": {
                    "provider": "faiss",
                    "config": {
                        "collection_name": "agent-party",
                        "path": os.path.join(MEMORY_CACHE_DIR,memoryId),
                        "distance_strategy": "euclidean",
                        "embedding_model_dims": cur_memory.get("embedding_dims", 1024)
                    }
                }
            }
            m0 = Memory.from_config(config)
    images = await images_in_messages(request.messages,fastapi_base_url)
    request.messages = await message_without_images(request.messages)
    open_tag = "<think>"
    close_tag = "</think>"
    tools = request.tools or []
    tools = request.tools or []
    extra = {}
    reasoner_extra = {}
    if mcp_client_list:
        for server_name, mcp_client in mcp_client_list.items():
            if server_name in settings['mcpServers']:
                if 'disabled' not in settings['mcpServers'][server_name]:
                    settings['mcpServers'][server_name]['disabled'] = False
                if settings['mcpServers'][server_name]['disabled'] == False and settings['mcpServers'][server_name]['processingStatus'] == 'ready':
                    disable_tools = []
                    for tool in settings['mcpServers'][server_name]["tools"]: 
                        if tool.get("enabled", True) == False:
                            disable_tools.append(tool["name"])
                    function = await mcp_client.get_openai_functions(disable_tools=disable_tools)
                    if function:
                        tools.extend(function)
    get_llm_tool_fuction = await get_llm_tool(settings)
    if get_llm_tool_fuction:
        tools.append(get_llm_tool_fuction)
    get_agent_tool_fuction = await get_agent_tool(settings)
    if get_agent_tool_fuction:
        tools.append(get_agent_tool_fuction)
    get_a2a_tool_fuction = await get_a2a_tool(settings)
    if get_a2a_tool_fuction:
        tools.append(get_a2a_tool_fuction)
    if settings["HASettings"]["enabled"]:
        ha_tool = await HA_client.get_openai_functions(disable_tools=[])
        if ha_tool:
            tools.extend(ha_tool)
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
        chromeMCP_tool = await ChromeMCP_client.get_openai_functions(disable_tools=[])
        if chromeMCP_tool:
            tools.extend(chromeMCP_tool)
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
        tools.extend(all_cdp_tools)
    if settings['sqlSettings']['enabled']:
        sql_tool = await sql_client.get_openai_functions(disable_tools=[])
        if sql_tool:
            tools.extend(sql_tool)
    if settings['CLISettings']['enabled']:
        if settings['CLISettings']['engine'] == 'ds':
            tools.extend(get_tools_for_mode('yolo'))
        elif settings['CLISettings']['engine'] == 'local':
            tools.extend(get_local_tools_for_mode('yolo'))
        elif settings['CLISettings']['engine'] == 'acp':
            tools.append(acp_agent_tool)
    if  settings['CLISettings']['mode_change']:
        tools.append(mode_change_tool)
    if settings['visionControlSettings']['enabled']:
        tools.extend(computer_use_tools)
        if settings['visionControlSettings']['mouse']:
            tools.extend(mouse_use_tools)
        if settings['visionControlSettings']['keyboard']:
            tools.extend(keyboard_use_tools)
        if not settings['visionControlSettings']['desktopVision']:
            tools.extend(desktopVision_use_tools)
    if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'afterThinking':
        tools.append(time_tool)
    if settings["tools"]["weather"]['enabled']:
        tools.append(weather_tool)
        tools.append(location_tool)
        tools.append(timer_weather_tool)
    if settings["tools"]["wikipedia"]['enabled']:
        tools.append(wikipedia_summary_tool)
        tools.append(wikipedia_section_tool)
    if settings["tools"]["arxiv"]['enabled']:
        tools.append(arxiv_tool)
    if (settings.get("diarySettings", {}) or {}).get("enabled", False):
        tools.append(diary_query_tool)
        tools.append(diary_books_tool)
    if settings['text2imgSettings']['enabled']:
        if settings['text2imgSettings']['engine'] == 'pollinations' and not _is_steam_build:
            tools.append(pollinations_image_tool)
        elif settings['text2imgSettings']['engine'] == 'openai':
            tools.append(openai_image_tool)
        elif settings['text2imgSettings']['engine'] == 'openaiChat':
            tools.append(openai_chat_image_tool)
    if settings['tools']['getFile']['enabled']:
        tools.append(file_tool)
        tools.append(image_tool)
    if settings['tools']['autoBehavior']['enabled'] and request.messages[-1]['role'] == 'user':
        tools.append(auto_behavior_tool)
    if settings["codeSettings"]['enabled']:
        if settings["codeSettings"]["engine"] == "e2b":
            tools.append(e2b_code_tool)
        elif settings["codeSettings"]["engine"] == "sandbox":
            tools.append(local_run_code_tool)
    if settings["custom_http"]:
        for custom_http in settings["custom_http"]:
            if custom_http["enabled"]:
                if custom_http['body'] == "":
                    custom_http['body'] = "{}"
                custom_http_tool = {
                    "type": "function",
                    "function": {
                        "name": f"custom_http_{custom_http['name']}",
                        "description": f"{custom_http['description']}",
                        "parameters": json.loads(custom_http['body']),
                    },
                }
                tools.append(custom_http_tool)
    if settings["workflows"]:
        for workflow in settings["workflows"]:
            if workflow["enabled"]:
                comfyui_properties = {}
                comfyui_required = []
                if workflow["text_input"] is not None:
                    comfyui_properties["text_input"] = {
                        "description": "第一个文字输入，需要输入的提示词，用于生成图片或者视频，如果无特别提示，默认为英文",
                        "type": "string"
                    }
                    comfyui_required.append("text_input")
                if workflow["text_input_2"] is not None:
                    comfyui_properties["text_input_2"] = {
                        "description": "第二个文字输入，需要输入的提示词，用于生成图片或者视频，如果无特别提示，默认为英文",
                        "type": "string"
                    }
                    comfyui_required.append("text_input_2")
                if workflow["image_input"] is not None:
                    comfyui_properties["image_input"] = {
                        "description": "第一个图片输入，需要输入的图片，必须是图片URL，可以是外部链接，也可以是服务器内部的URL，例如：https://www.example.com/xxx.png  或者  http://127.0.0.1:3456/xxx.jpg",
                        "type": "string"
                    }
                    comfyui_required.append("image_input")
                if workflow["image_input_2"] is not None:
                    comfyui_properties["image_input_2"] = {
                        "description": "第二个图片输入，需要输入的图片，必须是图片URL，可以是外部链接，也可以是服务器内部的URL，例如：https://www.example.com/xxx.png  或者  http://127.0.0.1:3456/xxx.jpg",
                        "type": "string"
                    }
                    comfyui_required.append("image_input_2")
                comfyui_parameters = {
                    "type": "object",
                    "properties": comfyui_properties,
                    "required": comfyui_required
                }
                comfyui_tool = {
                    "type": "function",
                    "function": {
                        "name": f"comfyui_{workflow['unique_filename']}",
                        "description": f"{workflow['description']}+\n如果要输入图片提示词或者修改提示词，尽可能使用英语。\n返回的图片结果，请将图片的URL放入![image]()这样的markdown语法中，用户才能看到图片。如果是视频，请将视频的URL放入<video controls> <source src=''></video>的中src中，用户才能看到视频。如果有多个结果，则请用换行符分隔开这几个图片或者视频，用户才能看到多个结果。",
                        "parameters": comfyui_parameters,
                    },
                }
                tools.append(comfyui_tool)
    search_not_done = False
    search_task = ""
    try:
        model = settings['model']
        extra_params = settings['extra_params']
        # 移除extra_params这个list中"name"不包含非空白符的键值对
        if extra_params:
            for extra_param in extra_params:
                if not extra_param['name'].strip():
                    extra_params.remove(extra_param)
            # 列表转换为字典
            extra_params = process_extra_params(extra_params)
        else:
            extra_params = {}
        if request.fileLinks:
            # 异步获取文件内容
            files_content = await get_files_content(request.fileLinks)
            system_message = f"\n\n相关文件内容：{files_content}"
            
            # 修复字符串拼接错误
            content_append(request.messages, 'system', system_message)
        kb_list = []
        user_prompt = request.messages[-1].get('content') or ""

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "" and not request.is_sub_agent:
            # 用户名提示（固定）
            if settings["memorySettings"]["userName"]:
                print("添加用户名：\n\n" + settings["memorySettings"]["userName"] + "\n\n用户名结束\n\n")
                content_append(request.messages, 'system', "与你交流的默认用户名为：\n\n" + settings["memorySettings"]["userName"] + "\n\n注意！除非用户消息中提到了是其他用户发送，否则视为默认用户发送的消息\n\n")

            # 固定人设：角色描述、性格、对话示例、自定义 systemPrompt、通用 systemPrompt
            if cur_memory["description"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["description"] = cur_memory["description"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["description"] = cur_memory["description"].replace("{{char}}", cur_memory["name"])
                print("添加角色设定：\n\n" + cur_memory["description"] + "\n\n角色设定结束\n\n")
                content_append(request.messages, 'system', "角色设定：\n\n" + cur_memory["description"] + "\n\n角色设定结束\n\n")

            if cur_memory["personality"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["personality"] = cur_memory["personality"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["personality"] = cur_memory["personality"].replace("{{char}}", cur_memory["name"])
                print("添加性格设定：\n\n" + cur_memory["personality"] + "\n\n性格设定结束\n\n")
                content_append(request.messages, 'system', "性格设定：\n\n" + cur_memory["personality"] + "\n\n性格设定结束\n\n")

            if cur_memory['mesExample']:
                if settings["memorySettings"]["userName"]:
                    cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{char}}", cur_memory["name"])
                print("添加对话示例：\n\n" + cur_memory['mesExample'] + "\n\n对话示例结束\n\n")
                content_append(request.messages, 'system', "对话示例：\n\n" + cur_memory['mesExample'] + "\n\n对话示例结束\n\n")

            if cur_memory["systemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + cur_memory["systemPrompt"] + "\n\n")

            if settings["memorySettings"]["genericSystemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    settings["memorySettings"]["genericSystemPrompt"] = settings["memorySettings"]["genericSystemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                settings["memorySettings"]["genericSystemPrompt"] = settings["memorySettings"]["genericSystemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + settings["memorySettings"]["genericSystemPrompt"] + "\n\n")

        # ========== 动态上下文收集（统一追加到用户消息末尾） ==========
        dynamic_user_context = ""

        # 世界书匹配（动态，基于当前轮输入/回复触发）
        lore_content = ""
        assistant_reply = ""
        for i in range(len(request.messages)-1, -1, -1):
            if request.messages[i]['role'] == 'assistant':
                assistant_reply = request.messages[i]['content']
                break

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and not request.is_sub_agent:
            if cur_memory.get("characterBook"):
                for lore in cur_memory["characterBook"]:
                    lore_keys = [key for key in lore.get("keysRaw", "").split("\n") if key != ""]
                    if lore_keys and any(key in user_prompt or key in assistant_reply for key in lore_keys):
                        lore_content += lore['content'] + "\n\n"

        if lore_content:
            if settings["memorySettings"]["userName"]:
                lore_content = lore_content.replace("{{user}}", settings["memorySettings"]["userName"])
            lore_content = lore_content.replace("{{char}}", cur_memory["name"])
            print("添加世界观设定（动态，注入到用户消息）：\n\n" + lore_content + "\n\n世界观设定结束\n\n")
            dynamic_user_context += f"\n\n[世界设定]\n{lore_content}"

        # 记忆检索（动态，基于当前用户输入）
        if m0 and not request.is_sub_agent:
            memoryLimit = settings["memorySettings"]["memoryLimit"]
            try:
                relevant_memories = await asyncio.to_thread(
                    m0.search,
                    query=user_prompt,
                    user_id=settings["memorySettings"]["selectedMemory"],
                    limit=memoryLimit
                )
                relevant_memories = json.dumps(relevant_memories, ensure_ascii=False)
            except Exception as e:
                print("m0.search error:", e)
                relevant_memories = ""
            if relevant_memories:
                print("添加相关记忆（动态，注入到用户消息）：\n\n" + relevant_memories + "\n\n相关结束\n\n")
                dynamic_user_context += f"\n\n[相关记忆]\n{relevant_memories}"

        # 将动态内容追加到最后一条 user 消息的末尾
        if dynamic_user_context:
            if request.messages and request.messages[-1]['role'] == 'user':
                request.messages[-1]['content'] += dynamic_user_context
        
        if settings["knowledgeBases"]:
            for kb in settings["knowledgeBases"]:
                if kb["enabled"] and kb["processingStatus"] == "completed":
                    kb_list.append({"kb_id":kb["id"],"name": kb["name"],"introduction":kb["introduction"]})
        if settings["KBSettings"]["when"] == "before_thinking" or settings["KBSettings"]["when"] == "both":
            if kb_list:
                all_kb_content = []
                # 用query_knowledge_base函数查询kb_list中所有的知识库
                for kb in kb_list:
                    kb_content = await query_knowledge_base(kb["kb_id"],user_prompt)
                    all_kb_content.extend(kb_content)
                    if settings["KBSettings"]["is_rerank"]:
                        all_kb_content = await rerank_knowledge_base(user_prompt,all_kb_content)
                if all_kb_content:
                    kb_message = f"\n\n可参考的知识库内容：{all_kb_content}"
                    content_append(request.messages, 'user',  f"{kb_message}\n\n用户：{user_prompt}")
        if settings["KBSettings"]["when"] == "after_thinking" or settings["KBSettings"]["when"] == "both":
            if kb_list:
                kb_list_message = f"\n\n可调用的知识库列表：{json.dumps(kb_list, ensure_ascii=False)}"
                content_append(request.messages, 'system', kb_list_message)
        else:
            kb_list = []
        request = await tools_change_messages(request, settings)
        # 如果系统消息为空字符串或者仅包含空白符，则将系统消息改成"you are a helpful assistant."
        if request.messages[0]['role'] == 'system' and not request.messages[0]['content'].strip():
            request.messages[0]['content'] = "you are a helpful assistant."
        chat_vendor = 'OpenAI'
        reasoner_vendor = 'OpenAI'
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['selectedProvider']:
                chat_vendor = modelProvider['vendor']
                break
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                reasoner_vendor = modelProvider['vendor']
                break
        if chat_vendor == 'Dify':
            try:
                if len(request.messages) >= 3:
                    if request.messages[2]['role'] == 'user':
                        if request.messages[1]['role'] == 'assistant':
                            request.messages[2]['content'] = "你上一次的发言：\n" +request.messages[0]['content'] + "\n你上一次的发言结束\n\n用户：" + request.messages[2]['content']
                        if request.messages[0]['role'] == 'system':
                            request.messages[2]['content'] = "系统提示：\n" +request.messages[0]['content'] + "\n系统提示结束\n\n" + request.messages[2]['content']
                elif len(request.messages) >= 2:
                    if request.messages[1]['role'] == 'user':
                        if request.messages[0]['role'] == 'system':
                            request.messages[1]['content'] = "系统提示：\n" +request.messages[0]['content'] + "\n系统提示结束\n\n用户：" + request.messages[1]['content']
            except Exception as e:
                print("Dify error:",e)
        if settings['webSearch']['enabled'] or enable_web_search:
            if settings['webSearch']['when'] == 'before_thinking' or settings['webSearch']['when'] == 'both':
                if settings['webSearch']['engine'] == 'duckduckgo':
                    results = await DDGsearch(user_prompt)
                elif settings['webSearch']['engine'] == 'searxng':
                    results = await searxng(user_prompt)
                elif settings['webSearch']['engine'] == 'tavily':
                    results = await Tavily_search(user_prompt)
                elif settings['webSearch']['engine'] == 'google':
                    results = await Google_search(user_prompt)
                elif settings['webSearch']['engine'] == 'brave':
                    results = await Brave_search(user_prompt)
                elif settings['webSearch']['engine'] == 'exa':
                    results = await Exa_search(user_prompt)
                elif settings['webSearch']['engine'] == 'serper':
                    results = await Serper_search(user_prompt)
                elif settings['webSearch']['engine'] == 'bochaai':
                    results = await bochaai_search(user_prompt)
                if results:
                    content_append(request.messages, 'user',  f"\n\n联网搜索结果：{results}")
            if settings['webSearch']['when'] == 'after_thinking' or settings['webSearch']['when'] == 'both':
                if settings['webSearch']['engine'] == 'duckduckgo' and not _is_steam_build:
                    tools.append(duckduckgo_tool)
                elif settings['webSearch']['engine'] == 'searxng':
                    tools.append(searxng_tool)
                elif settings['webSearch']['engine'] == 'tavily':
                    tools.append(tavily_tool)
                elif settings['webSearch']['engine'] == 'google':
                    tools.append(google_tool)
                elif settings['webSearch']['engine'] == 'brave':
                    tools.append(brave_tool)
                elif settings['webSearch']['engine'] == 'exa':
                    tools.append(exa_tool)
                elif settings['webSearch']['crawler'] == 'serper':
                    tools.append(serper_tool)
                elif settings['webSearch']['crawler'] == 'bochaai':
                    tools.append(bochaai_tool)

                if settings['webSearch']['crawler'] == 'jina' and not _is_steam_build:
                    tools.append(jina_crawler_tool)
                elif settings['webSearch']['crawler'] == 'crawl4ai':
                    tools.append(Crawl4Ai_tool)
                elif settings['webSearch']['crawler'] == 'firecrawl':
                    tools.append(firecrawl_tool)
                elif settings['webSearch']['crawler'] == 'simpleRequest':
                    tools.append(simple_fetch_tool)
                elif settings['webSearch']['crawler'] == 'mdnew':
                    tools.append(markdown_new_tool)
        if kb_list:
            tools.append(kb_tool)
        if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            deepsearch_messages = copy.deepcopy(request.messages)
            content_append(deepsearch_messages, 'user',  "\n\n将用户提出的问题或给出的当前任务拆分成多个步骤，每一个步骤用一句简短的话概括即可，无需回答或执行这些内容，直接返回总结即可，但不能省略问题或任务的细节。如果用户输入的只是闲聊或者不包含任务和问题，直接把用户输入重复输出一遍即可。如果是非常简单的问题，也可以只给出一个步骤即可。一般情况下都是需要拆分成多个步骤的。")
            response = await client.chat.completions.create(
                model=model,
                messages=deepsearch_messages,
                temperature=0.5, 
                extra_body = extra_params, # 其他参数
            )
            user_prompt = response.choices[0].message.content
            content_append(request.messages, 'user',  f"\n\n如果用户没有提出问题或者任务，直接闲聊即可，如果用户提出了问题或者任务，任务描述不清晰或者你需要进一步了解用户的真实需求，你可以暂时不完成任务，而是分析需要让用户进一步明确哪些需求。")
        if settings['reasoner']['enabled'] or enable_thinking:
            reasoner_messages = copy.deepcopy(request.messages)
            if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                drs_msg = get_drs_stage(DRS_STAGE)
                if drs_msg:
                    content_append(reasoner_messages, 'user',  f"\n\n{drs_msg}\n\n")
                content_append(reasoner_messages, 'user',  f"\n\n可参考的步骤：{user_prompt}\n\n")
            if tools:
                content_append(reasoner_messages, 'system',  f"可用工具：{json.dumps(tools)}")
            for modelProvider in settings['modelProviders']: 
                if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                    vendor = modelProvider['vendor']
                    break
            msg = await images_add_in_messages(reasoner_messages, images,settings)   
            if chat_vendor == 'OpenAI':
                extra['max_completion_tokens'] = request.max_tokens or settings['max_tokens']
            else:
                extra['max_tokens'] = request.max_tokens or settings['max_tokens']
            if reasoner_vendor == 'OpenAI':
                reasoner_extra['max_completion_tokens'] = settings['reasoner']['max_tokens']
            else:
                reasoner_extra['max_tokens'] = settings['reasoner']['max_tokens']
            if request.reasoning_effort or settings['reasoning_effort']:
                extra['reasoning_effort'] = request.reasoning_effort or settings['reasoning_effort']
            if settings['reasoner']['reasoning_effort'] is not None:
                reasoner_extra['reasoning_effort'] = settings['reasoner']['reasoning_effort'] 
            if vendor == 'Ollama':
                reasoner_response = await reasoner_client.chat.completions.create(
                    model=settings['reasoner']['model'],
                    messages=msg,
                    stream=False,
                    temperature=settings['reasoner']['temperature'],
                    **reasoner_extra
                )
                reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']
                if reasoning_buffer:
                    content_prepend(request.messages, 'assistant', reasoning_buffer) # 可参考的推理过程
                else:
                    reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning']
                    if reasoning_buffer:
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # 可参考的推理过程
                    else:
                        # 将推理结果中的思考内容提取出来
                        reasoning_content = reasoner_response.model_dump()['choices'][0]['message']['content']
                        # open_tag和close_tag之间的内容
                        start_index = reasoning_content.find(open_tag) + len(open_tag)
                        end_index = reasoning_content.find(close_tag)
                        if start_index != -1 and end_index != -1:
                            reasoning_content = reasoning_content[start_index:end_index]
                        else:
                            reasoning_content = ""
                        content_prepend(request.messages, 'assistant', reasoning_content) # 可参考的推理过程
            else:
                reasoner_response = await reasoner_client.chat.completions.create(
                    model=settings['reasoner']['model'],
                    messages=msg,
                    stream=False,
                    stop=settings['reasoner']['stop_words'],
                    temperature=settings['reasoner']['temperature'],
                    **reasoner_extra
                )
                reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']
                if reasoning_buffer:
                    content_prepend(request.messages, 'assistant', reasoning_buffer) # 可参考的推理过程
                else:
                    reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning']
                    if reasoning_buffer:
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # 可参考的推理过程
                    else:
                        reasoning_buffer = ""
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # 可参考的推理过程
        if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            content_append(request.messages, 'user',  f"\n\n可参考的步骤：{user_prompt}\n\n")
            drs_msg = get_drs_stage(DRS_STAGE)
            if drs_msg:
                content_append(request.messages, 'user',  f"\n\n{drs_msg}\n\n")
        msg = await images_add_in_messages(request.messages, images,settings)
        if request.top_p != 1 or settings['top_p'] != 1:
            extra['top_p'] = request.top_p or settings['top_p']
        if tools:
            response = await client.chat.completions.create(
                model=model,
                messages=msg,  # 添加图片信息到消息
                temperature=request.temperature or settings['temperature'],
                tools=tools,
                stream=False,
                extra_body = extra_params, # 其他参数
                **extra
            )
        else:
            response = await client.chat.completions.create(
                model=model,
                messages=msg,  # 添加图片信息到消息
                temperature=request.temperature or settings['temperature'],
                stream=False,
                extra_body = extra_params, # 其他参数
                **extra
            )
        if response.choices[0].message.tool_calls:
            pass
        elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,response.choices[0].message.content)
            research_response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                    "role": "user",
                    "content": search_prompt,
                    }
                ],
                temperature=0.5,
                extra_body = extra_params, # 其他参数
            )
            response_content = research_response.choices[0].message.content
            if response_content is None:
                response_content = ""

            # 用re 提取```json 包裹json字符串 ```
            if "```json" in response_content:
                try:
                    response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                except:
                    # 用re 提取```json 之后的内容
                    response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
            response_content = json.loads(response_content)
            if response_content["status"] == "done":
                search_not_done = False
            elif response_content["status"] == "not_done":
                search_not_done = True
                search_task = response_content["unfinished_task"]
                task_prompt = f"请继续完成初始任务中未完成的任务：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n最后，请给出完整的初始任务的最终结果。"
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": task_prompt,
                    }
                )
            elif response_content["status"] == "need_more_info":
                DRS_STAGE = 2
                search_not_done = False
            elif response_content["status"] == "need_work":
                DRS_STAGE = 2
                search_not_done = True
                drs_msg = get_drs_stage(DRS_STAGE)
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": drs_msg,
                    }
                )
            elif response_content["status"] == "need_more_work":
                DRS_STAGE = 2
                search_not_done = True
                search_task = response_content["unfinished_task"]
                task_prompt = f"请继续查询如下信息：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n"
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": task_prompt,
                    }
                )
            elif response_content["status"] == "answer":
                DRS_STAGE = 3
                search_not_done = True
                drs_msg = get_drs_stage(DRS_STAGE)
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": drs_msg,
                    }
                )
        reasoner_messages = copy.deepcopy(request.messages)
        while response.choices[0].message.tool_calls or search_not_done:
            if response.choices[0].message.tool_calls:
                assistant_message = response.choices[0].message
                response_content = assistant_message.tool_calls[0].function
                print(response_content.name)
                modified_data = '[' + response_content.arguments.replace('}{', '},{') + ']'
                # 使用json.loads来解析修改后的字符串为列表
                data_list = json.loads(modified_data)
                # 存储处理结果
                results = []
                for data in data_list:
                    result = await dispatch_tool(response_content.name, data,settings) # 将结果添加到results列表中
                    if isinstance(results, AsyncIterator):
                        buffer = []
                        async for chunk in results:
                            buffer.append(chunk)
                        results = "".join(buffer)
                    if result is not None:
                        # 将结果添加到results列表中
                        results.append(json.dumps(result))
                # 将所有结果拼接成一个连续的字符串
                combined_results = ''.join(results)
                if combined_results:
                    results = combined_results
                else:
                    results = None
                if results is None:
                    break
                if response_content.name in ["query_knowledge_base"]:
                    if settings["KBSettings"]["is_rerank"]:
                        results = await rerank_knowledge_base(user_prompt,results)
                    results = json.dumps(results, ensure_ascii=False, indent=4)
                request.messages.append(
                    {
                        "tool_calls": [
                            {
                                "id": assistant_message.tool_calls[0].id,
                                "function": {
                                    "arguments": response_content.arguments,
                                    "name": response_content.name,
                                },
                                "type": assistant_message.tool_calls[0].type,
                            }
                        ],
                        "role": "assistant",
                        "content": "",
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": assistant_message.tool_calls[0].id,
                        "name": response_content.name,
                        "content": str(results),
                    }
                )
            if settings['webSearch']['when'] == 'after_thinking' or settings['webSearch']['when'] == 'both':
                content_append(request.messages, 'user',  f"\n对于联网搜索的结果，如果联网搜索的信息不足以回答问题时，你可以进一步使用联网搜索查询还未给出的必要信息。如果已经足够回答问题，请直接回答问题。")
            reasoner_messages.append(
                {
                    "role": "assistant",
                    "content": str(response_content),
                    "reasoning_content": "",
                }
            )
            reasoner_messages.append(
                {
                    "role": "user",
                    "content": f"{response_content.name}工具结果："+str(results),
                }
            )
            if settings['reasoner']['enabled'] or enable_thinking:
                if tools:
                    content_append(reasoner_messages, 'system',  f"可用工具：{json.dumps(tools)}")
                for modelProvider in settings['modelProviders']: 
                    if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                        vendor = modelProvider['vendor']
                        break
                msg = await images_add_in_messages(reasoner_messages, images,settings)
                if vendor == 'Ollama':
                    reasoner_response = await reasoner_client.chat.completions.create(
                        model=settings['reasoner']['model'],
                        messages=msg,
                        stream=False,
                        temperature=settings['reasoner']['temperature'],
                        **reasoner_extra
                    )
                    # 将推理结果中的思考内容提取出来
                    reasoning_content = reasoner_response.model_dump()['choices'][0]['message']['content']
                    # open_tag和close_tag之间的内容
                    start_index = reasoning_content.find(open_tag) + len(open_tag)
                    end_index = reasoning_content.find(close_tag)
                    if start_index != -1 and end_index != -1:
                        reasoning_content = reasoning_content[start_index:end_index]
                    else:
                        reasoning_content = ""
                    content_prepend(request.messages, 'assistant', reasoning_content) # 可参考的推理过程
                else:
                    reasoner_response = await reasoner_client.chat.completions.create(
                        model=settings['reasoner']['model'],
                        messages=msg,
                        stream=False,
                        stop=settings['reasoner']['stop_words'],
                        temperature=settings['reasoner']['temperature'],
                        **reasoner_extra
                    )
                    content_prepend(request.messages, 'assistant', reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']) # 可参考的推理过程
            msg = await images_add_in_messages(request.messages, images,settings)
            if request.top_p != 1 or settings['top_p'] != 1:
                extra['top_p'] = request.top_p or settings['top_p']
            if tools:
                response = await client.chat.completions.create(
                    model=model,
                    messages=msg,  # 添加图片信息到消息
                    temperature=request.temperature or settings['temperature'],
                    tools=tools,
                    stream=False,
                    extra_body = extra_params, # 其他参数
                    **extra
                )
            else:
                response = await client.chat.completions.create(
                    model=model,
                    messages=msg,  # 添加图片信息到消息
                    temperature=request.temperature or settings['temperature'],
                    stream=False,
                    extra_body = extra_params, # 其他参数
                    **extra
                )
            if response.choices[0].message.tool_calls:
                pass
            elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,response.choices[0].message.content)
                research_response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                        "role": "user",
                        "content": search_prompt,
                        }
                    ],
                    temperature=0.5,
                    extra_body = extra_params, # 其他参数
                )
                response_content = research_response.choices[0].message.content
                # 用re 提取```json 包裹json字符串 ```
                if "```json" in response_content:
                    try:
                        response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                    except:
                        # 用re 提取```json 之后的内容
                        response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                response_content = json.loads(response_content)
                if response_content["status"] == "done":
                    search_not_done = False
                elif response_content["status"] == "not_done":
                    search_not_done = True
                    search_task = response_content["unfinished_task"]
                    task_prompt = f"请继续完成初始任务中未完成的任务：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n最后，请给出完整的初始任务的最终结果。"
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": task_prompt,
                        }
                    )
                elif response_content["status"] == "need_more_info":
                    DRS_STAGE = 2
                    search_not_done = False
                elif response_content["status"] == "need_work":
                    DRS_STAGE = 2
                    search_not_done = True
                    drs_msg = get_drs_stage(DRS_STAGE)
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": drs_msg,
                        }
                    )
                elif response_content["status"] == "need_more_work":
                    DRS_STAGE = 2
                    search_not_done = True
                    search_task = response_content["unfinished_task"]
                    task_prompt = f"请继续查询如下信息：\n\n{search_task}\n\n初始任务：{user_prompt}\n\n"
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": task_prompt,
                        }
                    )
                elif response_content["status"] == "answer":
                    DRS_STAGE = 3
                    search_not_done = True
                    drs_msg = get_drs_stage(DRS_STAGE)
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": drs_msg,
                        }
                    )
       # 处理响应内容
        response_dict = response.model_dump()
        content = response_dict["choices"][0]['message']['content']
        if response_dict["choices"][0]['message'].get('reasoning_content',""):
            pass
        else:
            response_dict["choices"][0]['message']['reasoning_content'] = response_dict["choices"][0]['message'].get('reasoning',"")
        if open_tag in content and close_tag in content:
            reasoning_content = re.search(fr'{open_tag}(.*?)\{close_tag}', content, re.DOTALL)
            if reasoning_content:
                # 存储到 reasoning_content 字段
                response_dict["choices"][0]['message']['reasoning_content'] = reasoning_content.group(1).strip()
                # 移除原内容中的标签部分
                response_dict["choices"][0]['message']['content'] = re.sub(fr'{open_tag}(.*?)\{close_tag}', '', content, flags=re.DOTALL).strip()
        if m0:
            messages=f"用户说：{user_prompt}\n\n---\n\n你说：{response_dict["choices"][0]['message']['content']}"
            executor = ThreadPoolExecutor()
            infer = cur_memory.get('infer') or False
            async def add():
                loop = asyncio.get_event_loop()
                # 绑定 user_id 关键字参数
                metadata = {
                    "timetamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                }
                func = partial(m0.add, user_id=memoryId,metadata=metadata,infer=infer)
                # 传递 messages 作为位置参数
                await loop.run_in_executor(executor, func, messages)
                print("知识库更新完成")

            asyncio.create_task(add())
        return JSONResponse(content=response_dict)
    except Exception as e:
        return JSONResponse(
            content={"error": {"message": str(e), "type": "api_error"}}
        )

@app.post("/execute_tool_manually")
async def execute_tool_manually(request: Request):
    """
    前端点击审批按钮后调用的接口（完美支持 AsyncIterator 流式逐步推送的版本）
    """
    try:
        data = await request.json()
        tool_name = data.get("tool_name")
        tool_params = data.get("tool_params") or {}
        approval_type = data.get("approval_type") # 'once' 或 'always'
        
        # 获取当前配置
        settings = await load_settings()
        cwd = settings.get("CLISettings", {}).get("cc_path")
        
        # ==================== 核心逻辑：处理 "Always" 许可白名单 ====================
        if approval_type == "always":
            if cwd:
                try:
                    add_tool_to_project_config(cwd, tool_name)
                    print(f"[Permission] Added {tool_name} to whitelist for project {cwd}")
                except Exception as e:
                    return {"result": f"[System Error] Failed to save permission: {str(e)}"}
            else:
                 return {"result": "[System Error] No working directory found to save config."}

        # ==================== 🚀 核心优化：直接委托 dispatch_tool 执行 ====================
        result = await dispatch_tool(tool_name, tool_params, settings, force_allow=True)
        
        if inspect.isawaitable(result):
            result = await result

        # ==================== 🚀 核心优化：流式逐步推送 (AsyncIterator) ====================
        # 如果该工具运行产生的是流式输出，我们返回 StreamingResponse，以 SSE (data:) 格式逐步发给前端
        if inspect.isgenerator(result) or inspect.isasyncgen(result) or hasattr(result, "__aiter__"):
            async def event_generator():
                try:
                    async for chunk in result:
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                except Exception as stream_err:
                    yield f"data: {json.dumps({'error': str(stream_err)}, ensure_ascii=False)}\n\n"
            return StreamingResponse(event_generator(), media_type="text/event-stream")
            
        # 常规工具返回（一次性返回）
        return {"result": str(result)}

    except Exception as e:
        traceback.print_exc()
        return {"result": f"Backend System Error: {str(e)}\n{traceback.format_exc()}"}


# 在现有路由后添加以下代码
@app.get("/v1/models")
async def get_models():
    """
    获取模型列表
    """
    from openai.types import Model
    from openai.pagination import SyncPage
    try:
        # 重新加载最新设置
        current_settings = await load_settings()
        agents = current_settings['agents']
        # 构造符合 OpenAI 格式的 Model 对象
        model_data = [
            Model(
                id=agent["name"],  
                created=0,  
                object="model",
                owned_by="super-agent-party"  # 非空字符串
            )
            for agent in agents.values()  
        ]
        # 添加默认的 'super-model'
        model_data.append(
            Model(
                id='super-model',
                created=0,
                object="model",
                owned_by="super-agent-party"  # 非空字符串
            )
        )

        # 构造完整 SyncPage 响应
        response = SyncPage[Model](
            object="list",
            data=model_data,
            has_more=False  # 添加分页标记
        )
        # 直接返回模型字典，由 FastAPI 自动序列化为 JSON
        return response.model_dump()  
        
    except Exception as e:
        return JSONResponse(
            status_code=e.status_code,
            content={
                "error": {
                    "message": str(e),
                    "type": "api_error",
                }
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": str(e),
                    "type": "server_error",
                    "code": 500
                }
            }
        )

# 在现有路由后添加以下代码
@app.get("/v1/agents",operation_id="get_agents")
async def get_agents():
    """
    获取模型列表
    """
    from openai.types import Model
    from openai.pagination import SyncPage
    try:
        # 重新加载最新设置
        current_settings = await load_settings()
        agents = current_settings['agents']
        # 构造符合 OpenAI 格式的 Model 对象
        model_data = [
            {
                "name": agent["name"],
                "description": agent["system_prompt"],
            }
            for agent in agents.values()  
        ]
        # 添加默认的 'super-model'
        model_data.append(
            {
                "name": 'super-model',
                "description": "Super-Agent-Party default agent",
            }
        )
        return model_data
        
    except Exception as e:
        return JSONResponse(
            status_code=e.status_code,
            content={
                "error": {
                    "message": str(e),
                    "type": "api_error",
                }
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": str(e),
                    "type": "server_error",
                    "code": 500
                }
            }
        )

class ProviderModelRequest(BaseModel):
    url: str
    api_key: str
    vendor: Optional[str] = None  # 可选字段，用于指定供应商

@app.post("/v1/providers/models")
async def fetch_provider_models(request: ProviderModelRequest):
    try:
        global global_http_client
        vendor = getattr(request, 'vendor', None)
        print(f"Fetching models from provider: {vendor} at URL: {request.url}")
        # 1. 拦截 Claude
        if vendor == 'customAnthropic':
            client = AsyncClaudeAsOpenAI(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )
        # 2. 拦截 Gemini
        elif vendor == 'Gemini':
            client = AsyncGeminiAsOpenAI(
                api_key=request.api_key,
                base_url=request.url,
                http_client=global_http_client
            )
        # 3. 拦截 Dify
        elif vendor == 'Dify':
            client = DifyOpenAIAsync(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )
        # 4. 兜底走到标准 OpenAI
        else:
            client = AsyncOpenAI(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )

        model_list = await client.models.list()
        return JSONResponse(content={"data":[model.id for model in model_list.data]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions", operation_id="chat_with_agent_party")
async def chat_endpoint(request: ChatRequest, fastapi_request: Request):
    """
    用来与agent party中的模型聊天
    """
    fastapi_base_url = str(fastapi_request.base_url)
    # 【注意】引入全局 fast_client
    global client, reasoner_client, fast_client, settings, mcp_client_list
    
    raw_model = request.model or 'super-model'
    override_memory_id = None
    
    if raw_model.startswith("memory/"):
        parts = raw_model.split('/', 2) 
        if len(parts) >= 2:
            override_memory_id = parts[1]
            request.model = parts[2] if len(parts) > 2 else 'super-model'
            print(f"检测到动态 Memory ID: {override_memory_id}, 目标模型更新为: {request.model}")
    
    model = request.model or 'super-model'
    enable_thinking = request.enable_thinking or False
    enable_deep_research = request.enable_deep_research or False
    enable_web_search = request.enable_web_search or False
    async_tools_id = request.asyncToolsID or None

    current_settings = await load_settings()
    if current_settings.get("systemSettings", {}).get("contentSafety", False):
        all_text = ""
        for msg in request.messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                all_text += " " + content
            elif isinstance(content, list):
                all_text += " " + " ".join(item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text")
        is_safe, matched = await check_content_safety(all_text)
        if not is_safe:
            print(f"[content_safety] input blocked words: {matched}")
            return JSONResponse(
                status_code=403,
                content={"error": {"message": "您的输入包含敏感内容，已被安全策略拦截。", "type": "content_safety", "code": 403}}
            )

    await _apply_group_memory_context(request)

    if model == 'super-model':
        current_settings = await load_settings()
        
        # 【修改点1】创建当前请求的专属配置，避免污染全局
        request_settings = current_settings.copy()
        active_client = client  # 默认使用主模型
        
        if current_settings['fast']['enabled'] and not request.is_sub_agent:
            fast_cfg = current_settings['fast']
            use_fast_model = False
            
            if fast_cfg.get('triggerMode') == 'always':
                use_fast_model = True
            elif fast_cfg.get('triggerMode') == 'conditional':
                last_user_text = ""
                has_image = False
                for msg in reversed(request.messages):
                    if msg.get('role') == 'user':
                        content = msg.get('content')
                        if isinstance(content, str):
                            last_user_text = content
                        elif isinstance(content, list):
                            texts = []
                            for item in content:
                                if item.get('type') == 'text':
                                    texts.append(item.get('text', ''))
                                elif item.get('type') == 'image_url':
                                    has_image = True
                            last_user_text = "".join(texts)
                        break
                
                has_files = bool(request.fileLinks) 
                condition_pass = True
                
                max_len = fast_cfg.get('conditionMaxLen', 0)
                if max_len > 0 and len(last_user_text) > max_len:
                    condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoNewline', False):
                    if '\n' in last_user_text:
                        condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoFiles', True):
                    if has_image or has_files:
                        condition_pass = False
                        
                if condition_pass:
                    use_fast_model = True

            if use_fast_model:
                exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
                fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
                
                # 更新专属配置，不影响 current_settings
                request_settings.update(fast_config)
                
                # 【修改点2】动态检查并更新快速模型的 Client (仅配置被修改时触发)
                old_fast_cfg = settings.get('fast', {}) if settings else {}
                if (fast_client is None 
                    or fast_cfg.get('api_key') != old_fast_cfg.get('api_key') 
                    or fast_cfg.get('base_url') != old_fast_cfg.get('base_url')):
                    
                    f_provider = fast_cfg.get('selectedProvider', current_settings.get('selectedProvider'))
                    f_class = get_client_class(current_settings, f_provider)
                    fast_client = f_class(
                        api_key=fast_cfg.get('api_key') or current_settings.get('api_key'),
                        base_url=fast_cfg.get('base_url') or current_settings.get('base_url') or "https://api.openai.com/v1"
                    )
                    _wrap_client_chat_with_retry(fast_client)

                # 当前请求切花为快速 Client
                active_client = fast_client

        if override_memory_id:
            request_settings["memorySettings"]["is_memory"] = True
            request_settings["memorySettings"]["selectedMemory"] = override_memory_id
            
        if len(current_settings['modelProviders']) <= 0:
            return JSONResponse(status_code=500, content={"error": {"message": await t("NoModelProvidersConfigured"), "type": "server_error", "code": 500}})

        # 【修改点3】动态更新主模型 Client (仅主配置修改时)
        if (current_settings['api_key'] != settings['api_key'] 
            or current_settings['base_url'] != settings['base_url']
            or client is None):
            c_class = get_client_class(current_settings, current_settings['selectedProvider'])
            client = c_class(
                api_key=current_settings['api_key'],
                base_url=current_settings['base_url'] or "https://api.openai.com/v1",
            )
            _wrap_client_chat_with_retry(client)
            # 如果当前没有触发快速模型，需要确保 active_client 指向最新的主 client
            if active_client != fast_client:
                active_client = client

        # 动态更新推理模型 Client
        if (current_settings['reasoner']['api_key'] != settings['reasoner']['api_key'] 
            or current_settings['reasoner']['base_url'] != settings['reasoner']['base_url']
            or reasoner_client is None):
            r_class = get_client_class(current_settings, current_settings['reasoner']['selectedProvider'])
            reasoner_client = r_class(
                api_key=current_settings['reasoner']['api_key'],
                base_url=current_settings['reasoner']['base_url'] or "https://api.openai.com/v1",
            )
            _wrap_client_chat_with_retry(reasoner_client)

        print('model:', request_settings['model'])
        
        # 将"system_prompt"插入到request.messages[0].content中 (注意这里使用的是 request_settings)
        if request_settings['system_prompt']:
            content_prepend(request.messages, 'system', request_settings['system_prompt'] + "\n\n")
            
        # 【核心修正】因为之前我们没污染 current_settings，所以这里的比较才是真实的配置对比
        if current_settings != settings:
            settings = current_settings
            
        try:
            # 传入 active_client (0延迟切换) 和 request_settings
            if request.stream:
                cli_settings = request_settings.get("CLISettings", {})
                engine = cli_settings.get("engine", "")
                if engine == "local":
                    env_settings = request_settings.get("localEnvSettings", {})
                elif engine == "ds":
                    env_settings = request_settings.get("dsSettings", {})
                else:
                    env_settings = request_settings.get("acpSettings", {})
                permission_mode = env_settings.get("permissionMode", "default")
                goal_mode_active = (permission_mode == "goal" and cli_settings.get("enabled", False) and not request.is_sub_agent)
                max_goal_iterations = request_settings.get("systemSettings", {}).get("goal_iterations", 30)

                if not goal_mode_active:
                    return await generate_stream_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id)

                async def goal_wrapper(iteration_counter):
                    while True:
                        msg_count_before = len(request.messages)
                        stream_resp = await generate_stream_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id)
                        async for chunk in stream_resp.body_iterator:
                            if isinstance(chunk, bytes):
                                chunk = chunk.decode('utf-8')
                            if chunk.startswith("data: [DONE]"):
                                continue
                            yield chunk

                        finish_called = False
                        for msg in request.messages[msg_count_before:]:
                            tcs = msg.get("tool_calls", []) if isinstance(msg, dict) else []
                            for tc in (tcs or []):
                                if isinstance(tc, dict) and tc.get("function", {}).get("name") == "finish_main_task":
                                    finish_called = True
                                    break
                            if finish_called:
                                break

                        if finish_called:
                            yield "data: [DONE]\n\n"
                            return

                        iteration_counter[0] += 1
                        if iteration_counter[0] >= max_goal_iterations:
                            max_chunk = {"choices": [{"delta": {"content": f"\n\n已达到最大目标迭代次数（{max_goal_iterations}次），任务自动结束。"}}]}
                            yield f"data: {json.dumps(max_chunk)}\n\n"
                            yield "data: [DONE]\n\n"
                            return

                        request.messages.append({
                            "role": "user",
                            "content": "请审视你的任务是否已经完成？如果已完成，请调用 finish_main_task 工具并提供最终产出结果来标记任务完成；如果尚未完成，请继续执行。"
                        })

                return StreamingResponse(goal_wrapper([0]), media_type="text/event-stream")
            return await generate_complete_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search)
        except asyncio.CancelledError:
            print("Client disconnected")
            raise
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": {"message": str(e), "type": "server_error", "code": 500}})
            
    else:
        # ===== Agent 部分逻辑 ===== 
        # (因为 agent_settings 每次请求都是从本地 json.load 创建的新字典，
        # 所以它天生就不会产生你主模型遇到的“全局污染”问题，这里的代码可以基本保留原样)
        
        current_settings = await load_settings()
        agentSettings = current_settings['agents'].get(model, {})
        if not agentSettings:
            for agentId , agentConfig in current_settings['agents'].items():
                if current_settings['agents'][agentId]['name'] == model:
                    agentSettings = current_settings['agents'][agentId]
                    break
        if not agentSettings:
            return JSONResponse(status_code=404, content={"error": {"message": f"Agent {model} not found", "type": "not_found", "code": 404}})
            
        # 每次读取文件生成新的 agent_settings 字典
        if agentSettings['config_path']:
            with open(agentSettings['config_path'], 'r' , encoding='utf-8') as f:
                agent_settings = json.load(f)
            if agentSettings['system_prompt']:
                content_prepend(request.messages, 'user', agentSettings['system_prompt'] + "\n\n")
        
        if agent_settings['fast']['enabled'] and not request.is_sub_agent:
            fast_cfg = agent_settings['fast']
            use_fast_model = False
            
            if fast_cfg.get('triggerMode') == 'always':
                use_fast_model = True
            elif fast_cfg.get('triggerMode') == 'conditional':
                last_user_text = ""
                has_image = False
                for msg in reversed(request.messages):
                    if msg.get('role') == 'user':
                        content = msg.get('content')
                        if isinstance(content, str):
                            last_user_text = content
                        elif isinstance(content, list):
                            texts = []
                            for item in content:
                                if item.get('type') == 'text':
                                    texts.append(item.get('text', ''))
                                elif item.get('type') == 'image_url':
                                    has_image = True
                            last_user_text = "".join(texts)
                        break
                
                has_files = bool(request.fileLinks)
                condition_pass = True
                max_len = fast_cfg.get('conditionMaxLen', 0)
                if max_len > 0 and len(last_user_text) > max_len: condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoNewline', False):
                    if '\n' in last_user_text: condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoFiles', True):
                    if has_image or has_files: condition_pass = False
                        
                if condition_pass:
                    use_fast_model = True

            if use_fast_model:
                exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
                fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
                agent_settings.update(fast_config) # Agent 这里更新无所谓，因为它是局部变量
                
        # 顺便用上刚才写的辅助函数简化代码
        a_client_class = get_client_class(agent_settings, agent_settings.get('selectedProvider'))
        agent_client = a_client_class(
            api_key=agent_settings.get('api_key', ''),
            base_url=agent_settings.get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(agent_client)

        ar_client_class = get_client_class(agent_settings, agent_settings.get('reasoner', {}).get('selectedProvider'))
        agent_reasoner_client = ar_client_class(
            api_key=agent_settings.get('reasoner', {}).get('api_key', ''),
            base_url=agent_settings.get('reasoner', {}).get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(agent_reasoner_client)
        
        try:
            if request.stream:
                return await generate_stream_response(agent_client, agent_reasoner_client, request, agent_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id)
            return await generate_complete_response(agent_client, agent_reasoner_client, request, agent_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search)
        except asyncio.CancelledError:
            print("Client disconnected")
            raise
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": {"message": str(e), "type": "server_error", "code": 500}})

@app.post("/simple_chat")
async def simple_chat_endpoint(request: ChatRequest):
    """
    同时支持流式(stream=true)与非流式(stream=false)
    默认使用 fast_client 以提高响应速度
    """
    global fast_client, settings

    current_settings = await load_settings()
    if len(current_settings['modelProviders']) <= 0:
        return JSONResponse(
            status_code=500,
            content={"error": {"message": await t("NoModelProvidersConfigured"),
                               "type": "server_error", "code": 500}}
        )

    # safety check for all input including system prompt
    if current_settings.get("systemSettings", {}).get("contentSafety", False):
        all_text = ""
        for msg in request.messages:
            all_text += " " + _extract_text_content(msg.get("content", ""))
        is_safe, matched = await check_content_safety(all_text)
        if not is_safe:
            print(f"[content_safety] blocked words: {matched}")
            return JSONResponse(
                status_code=403,
                content={"error": {"message": "您的输入包含敏感内容，已被安全策略拦截。",
                                   "type": "content_safety", "code": 403}}
            )

    fast_cfg = current_settings.get('fast', {})
    
    # 初始化或更新 fast_client
    if (fast_client is None 
        or fast_cfg.get('api_key') != settings.get('fast', {}).get('api_key')
        or fast_cfg.get('base_url') != settings.get('fast', {}).get('base_url')):
        
        f_provider = fast_cfg.get('selectedProvider', current_settings.get('selectedProvider'))
        f_class = get_client_class(current_settings, f_provider)
        fast_client = f_class(
            api_key=fast_cfg.get('api_key') or current_settings.get('api_key'),
            base_url=fast_cfg.get('base_url') or current_settings.get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(fast_client)
    
    # 使用 fast 配置覆盖当前配置
    if fast_cfg:
        exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
        fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
        for key, value in fast_config.items():
            current_settings[key] = value

    # --------------- 调用大模型 ---------------
    response = await fast_client.chat.completions.create(
        model=current_settings['model'],
        messages=request.messages,
        stream=request.stream,
        temperature=request.temperature or settings.get('temperature', 0.7),
    )

    # --------------- 非流式：一次性返回 JSON ---------------
    if not request.stream:
        # 注意：openai 返回的是 ChatCompletion 对象
        return JSONResponse(content=response.model_dump())

    # --------------- 流式：保持原来的 StreamingResponse ---------------
    async def openai_raw_stream():
        async for chunk in response:
            yield chunk.model_dump_json() + '\n'
        # 不发送 [DONE]

    return StreamingResponse(
        openai_raw_stream(),
        media_type="text/plain",      # 也可以保持 "text/event-stream"
        headers={"Cache-Control": "no-cache"}
    )

class GroupMemoryExtractRequest(BaseModel):
    group_id: Union[str, int, float]
    conversation_id: Union[str, int, float]
    user_message_id: Optional[Union[str, int, float]] = None
    assistant_message_id: Optional[Union[str, int, float]] = None
    user_message: str
    assistant_message: str

class DeleteConversationRequest(BaseModel):
    conversation_id: Union[str, int, float]
    delete_memory: bool = False

class ClearGroupMemoryRequest(BaseModel):
    group_id: Union[str, int, float]

@app.post("/api/group-memory/extract")
async def extract_group_memory_endpoint(req: GroupMemoryExtractRequest):
    req.group_id = _normalize_entity_id(req.group_id)
    req.conversation_id = _normalize_entity_id(req.conversation_id)
    req.user_message_id = _normalize_entity_id(req.user_message_id) or None
    req.assistant_message_id = _normalize_entity_id(req.assistant_message_id) or None

    group_map = await _load_group_map()
    group = group_map.get(req.group_id)
    if not group or not (group.get("memoryConfig") or {}).get("enabled"):
        return {"success": True, "memories": 0}

    current_settings = await load_settings()
    client_class = get_client_class(current_settings, current_settings.get('selectedProvider'))
    memory_client = client_class(
        api_key=current_settings.get('api_key'),
        base_url=current_settings.get('base_url') or "https://api.openai.com/v1",
    )
    memories = await _extract_group_memories(memory_client, current_settings, req.model_dump())
    await _upsert_group_memories(
        req.group_id,
        req.conversation_id,
        req.assistant_message_id or req.user_message_id or req.conversation_id,
        memories,
    )
    return {"success": True, "memories": len(memories)}

@app.post("/api/conversations/delete")
async def delete_conversation_endpoint(req: DeleteConversationRequest):
    req.conversation_id = _normalize_entity_id(req.conversation_id)
    covs = await load_covs()
    conversations = covs.get("conversations", []) or []
    covs["conversations"] = [conv for conv in conversations if conv.get("id") != req.conversation_id]
    await save_covs(covs)
    if req.delete_memory:
        await _invalidate_group_memories_by_chat(req.conversation_id)
    return {"success": True}

@app.post("/api/group-memory/clear-group")
async def clear_group_memory_endpoint(req: ClearGroupMemoryRequest):
    req.group_id = _normalize_entity_id(req.group_id)
    await _invalidate_group_memories_by_group(req.group_id)
    return {"success": True}

@app.post("/api/group-memory/clear-all")
async def clear_all_group_memory_endpoint():
    await _invalidate_all_group_memories()
    return {"success": True}

from py.task_center import get_task_center
from py.sub_agent import run_subtask_in_background

# --- 新增任务中心 API ---

class TaskCreateRequest(BaseModel):
    title: str
    description: str
    agent_type: str = "default"
    task_type: str = "once"  # once, time, cycle
    platforms: List[str] = []
    trigger_config: Optional[Dict[str, Any]] = None

@app.get("/v1/tasks/list")
async def list_tasks_endpoint():
    """获取当前工作区的所有任务"""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    
    if not workspace_dir:
        return {"tasks": [], "error": "No workspace configured"}
        
    try:
        task_center = await get_task_center(workspace_dir)
        tasks = await task_center.list_tasks()
        return {"tasks": [t.model_dump() for t in tasks]}
    except Exception as e:
        return {"tasks": [], "error": str(e)}

@app.post("/v1/tasks/create")
async def create_task_endpoint(req: TaskCreateRequest):
    """手动创建任务：支持单次、定时、周期模式"""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="工作区路径未配置")

    try:
        task_center = await get_task_center(workspace_dir)
        
        # 构造初始上下文
        context = {
            "task_type": req.task_type,
            "trigger_config": getattr(req, "trigger_config", {}), # 防止取不到报错
            "history": [],
            "ran_count": 0
        }
        
        # 1. 创建任务记录 (⭐ 关键修复：把 req.platforms 传进去)
        task = await task_center.create_task(
            title=req.title,
            description=req.description,
            agent_type=req.agent_type,
            parent_task_id="USER",
            context=context,
            platforms=req.platforms  # 👈👈👈 必须加这一行！
        )
        
        # 2. 读取共识（可选）
        consensus_content = None
        consensus_file = Path(workspace_dir) / ".agents" / "consensus.md"
        if consensus_file.exists():
            import aiofiles
            async with aiofiles.open(consensus_file, 'r', encoding='utf-8') as f:
                consensus_content = await f.read()

        # 3. 执行逻辑分发
        if req.task_type == "once":
            # 立即执行模式：直接丢进后台
            asyncio.create_task(
                run_subtask_in_background(
                    task_id=task.task_id,
                    workspace_dir=workspace_dir,
                    settings=current_settings,
                    consensus_content=consensus_content
                )
            )
            msg = "任务已启动"
        else:
            # 定时或周期模式：由 scheduler.py 负责，此处仅保存
            msg = f"计划任务已创建 (模式: {req.task_type})"
            
        return {"success": True, "message": msg, "task": task.model_dump()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
    
@app.post("/v1/tasks/cancel/{task_id}")
async def cancel_task_endpoint(task_id: str):
    """取消任务"""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="No workspace")
        
    task_center = await get_task_center(workspace_dir)
    success = await task_center.cancel_task(task_id)
    return {"success": success}

@app.delete("/v1/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    """删除任务"""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="No workspace")
        
    task_center = await get_task_center(workspace_dir)
    success = await task_center.delete_task(task_id)
    return {"success": success}

def sanitize_proxy_url(input_url: str) -> str:
    """
    针对代理场景优化的 URL 安全过滤
    """
    if not input_url:
        raise HTTPException(status_code=400, detail="URL 不能为空")
    
    # 1. 解析 URL
    parsed = urlparse(input_url)
    
    # 2. 验证协议 (禁止 file://, gopher:// 等协议)
    if parsed.scheme not in ["http", "https"]:
        raise HTTPException(status_code=400, detail="仅支持 http 或 https 协议")
    
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="无效的域名或 IP")

    # 3. 重新构造 URL (消除 SSRF 污点)
    # 排除 userinfo, 只保留必要部分
    safe_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    if parsed.query:
        safe_url += f"?{parsed.query}"
    if parsed.fragment:
        safe_url += f"#{parsed.fragment}"

    # 4. 内网审计
    if is_private_ip(parsed.hostname):
        logger.warning(f"Internal access detected: {safe_url}")

    return safe_url

@app.api_route("/extension_proxy", methods=["GET", "POST"])
async def extension_proxy(request: Request, url: str):
    """
    方便SAP插件调用的通用代理接口，让插件能够绕过 CORS 限制访问任意 URL。
    """
    BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    # --- 阶段 A: 安全校验 (保留，防止 SSRF 攻击内网) ---
    try:
        target_url = sanitize_proxy_url(url)
    except HTTPException as e:
        return Response(content=e.detail, status_code=e.status_code)
    
    # --- 阶段 B: 执行代理请求 ---
    method = request.method
    body = await request.body()
    
    # 构造 Header：只保留必要的，去除杂质，添加身份标识
    # 排除可能导致指纹泄露或被拒绝的 Header
    excluded_headers = {
        'host', 'content-length', 'connection', 'keep-alive', 
        'upgrade-insecure-requests', 'accept-encoding', 'cookie', 'user-agent'
    }
    
    headers = {
        k: v for k, v in request.headers.items() 
        if k.lower() not in excluded_headers
    }
    
    # 【关键点 1】：使用标准浏览器 UA，声明这是用户阅读行为
    headers["User-Agent"] = BROWSER_USER_AGENT
    
    # 【关键点 2】：明确告诉服务器我们接受 XML/RSS 格式，这显得更像一个良性阅读器
    if "accept" not in headers or "*/*" in headers["accept"]:
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"

    # 【关键点 3】：处理 Referer。有些防盗链机制需要 Referer，有些（如 Reddit）看到奇怪的 Referer 会拦截
    # 最安全的做法是不发送 Referer，或者设为目标域名的根目录
    headers.pop("Referer", None) 
    
    print(f"--- [Extension Proxy] ---")
    print(f"Target: {target_url} | Method: {method} | Mode: Browser Emulation")
    
    # trust_env=False: 防止你的 Python 代码意外使用了系统层的 HTTP 代理
    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=30.0, trust_env=False) as client:
        try:
            resp = await client.request(
                method=method,
                url=target_url,
                headers=headers,
                content=body
            )
            
            # 清洗响应头：防止将压缩编码或分块传输透传给前端导致解析错误
            resp_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() not in {
                    'content-encoding', 'content-length', 'transfer-encoding', 
                    'server', 'set-cookie' # 也不要透传 Set-Cookie，保护用户隐私
                }
            }
            
            # 如果 Reddit 依然返回 403，通常内容里会有错误提示，照样返回给前端便于调试
            if resp.status_code == 403:
                print(f"[Proxy Warning] Target returned 403. Body sample: {resp.content[:100]}")

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type", "application/octet-stream")
            )

        except httpx.ConnectError as e:
            err_msg = f"Proxy Connect Error: {e}"
            # 返回 JSON 格式错误以便前端优雅处理
            return Response(content=f'{{"error": "{err_msg}"}}', status_code=502, media_type="application/json")
            
        except Exception as e:
            print(f"[Proxy Error] System: {repr(e)}")
            return Response(content='{"error": "Internal Proxy Error"}', status_code=500, media_type="application/json")

        
# 存储活跃的ASR WebSocket连接
asr_connections = []

# 存储每个连接的音频帧数据
audio_buffer: Dict[str, Dict[str, Any]] = {}

def convert_audio_to_pcm16(audio_bytes: bytes, target_sample_rate: int = 16000) -> bytes:
    """
    将音频数据转换为PCM16格式，采样率16kHz
    """
    import numpy as np
    from scipy.io import wavfile
    try:
        # 创建临时文件
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_file_path = temp_file.name
        
        try:
            # 读取音频文件
            sample_rate, audio_data = wavfile.read(temp_file_path)
            
            # 转换为单声道
            if len(audio_data.shape) > 1:
                audio_data = np.mean(audio_data, axis=1)
            
            # 转换为float32进行重采样
            if audio_data.dtype != np.float32:
                if audio_data.dtype == np.int16:
                    audio_data = audio_data.astype(np.float32) / 32768.0
                elif audio_data.dtype == np.int32:
                    audio_data = audio_data.astype(np.float32) / 2147483648.0
                else:
                    audio_data = audio_data.astype(np.float32)
            
            # 重采样到目标采样率
            if sample_rate != target_sample_rate:
                from scipy.signal import resample
                num_samples = int(len(audio_data) * target_sample_rate / sample_rate)
                audio_data = resample(audio_data, num_samples)
            
            # 转换为int16 PCM格式
            audio_data = (audio_data * 32767).astype(np.int16)
            
            return audio_data.tobytes()
            
        finally:
            # 删除临时文件
            os.unlink(temp_file_path)
            
    except Exception as e:
        print(f"Audio conversion error: {e}")
        # 如果转换失败，尝试直接返回原始数据
        return audio_bytes

async def funasr_recognize(audio_data: bytes, funasr_settings: dict,ws: WebSocket,frame_id) -> str:
    """
    使用FunASR进行语音识别
    """
    try:
        # 获取FunASR服务器地址
        funasr_url = funasr_settings.get('funasr_ws_url', 'ws://localhost:10095')
        hotwords = funasr_settings.get('hotwords', '')
        if not funasr_url.startswith('ws://') and not funasr_url.startswith('wss://'):
            funasr_url = f"ws://{funasr_url}"
        
        # 连接到FunASR服务器
        async with websockets.connect(funasr_url) as websocket:
            print(f"Connected to FunASR server: {funasr_url}")
            
            # 1. 发送初始化配置
            init_config = {
                "chunk_size": [5, 10, 5],
                "wav_name": "python_client",
                "is_speaking": True,
                "chunk_interval": 10,
                "mode": "offline",  # 使用离线模式
                "hotwords": hotwords_to_json(hotwords),
                "use_itn": True
            }
            
            await websocket.send(json.dumps(init_config))
            print("Sent init config")
            
            # 2. 转换音频数据为PCM16格式
            pcm_data = convert_audio_to_pcm16(audio_data)
            print(f"PCM data length: {len(pcm_data)} bytes")
            
            # 3. 分块发送音频数据
            chunk_size = 960  # 30ms的音频数据 (16000 * 0.03 * 2 = 960字节)
            total_sent = 0
            
            while total_sent < len(pcm_data):
                chunk_end = min(total_sent + chunk_size, len(pcm_data))
                chunk = pcm_data[total_sent:chunk_end]
                
                # 发送二进制PCM数据
                await websocket.send(chunk)
                total_sent = chunk_end
            
            print(f"Sent all audio data: {total_sent} bytes")
            
            # 4. 发送结束信号
            end_config = {
                "is_speaking": False,
            }
            
            await websocket.send(json.dumps(end_config))
            print("Sent end signal")
            
            # 5. 等待识别结果
            result_text = ""
            timeout_count = 0
            max_timeout = 200  # 最大等待20秒
            
            while timeout_count < max_timeout:
                try:
                    # 等待响应消息
                    response = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                    
                    try:
                        # 尝试解析JSON响应
                        json_response = json.loads(response)
                        print(f"Received response: {json_response}")
                        
                        if 'text' in json_response:
                            text = json_response['text']
                            if text and text.strip():
                                result_text += text
                                print(f"Got text: {text}")
                                # 发送结果
                                await ws.send_json({
                                    "type": "transcription",
                                    "id": frame_id,
                                    "text": result_text,
                                    "is_final": True
                                })
                            # 检查是否为最终结果
                            if json_response.get('is_final', False):
                                print("Got final result")
                                break
                                
                    except json.JSONDecodeError:
                        # 如果不是JSON格式，可能是二进制数据，忽略
                        print(f"Non-JSON response: {response}")
                        pass
                        
                except asyncio.TimeoutError:
                    timeout_count += 1
                    continue
                except websockets.exceptions.ConnectionClosed:
                    print("WebSocket connection closed")
                    break
            
            if not result_text:
                print("No recognition result received")
                return ""
            
            return result_text.strip()
            
    except Exception as e:
        print(f"FunASR recognition error: {e}")
        return f"FunASR识别错误: {str(e)}"

def hotwords_to_json(input_str):
    # 初始化结果字典
    result = {}
    
    # 按行分割输入字符串
    lines = input_str.split('\n')
    
    for line in lines:
        # 清理行首尾的空白字符
        cleaned_line = line.strip()
        
        # 跳过空行
        if not cleaned_line:
            continue
            
        # 分割词语和权重
        parts = cleaned_line.rsplit(' ', 1)  # 从右边分割一次
        
        if len(parts) != 2:
            continue  # 跳过格式不正确的行
            
        word = parts[0].strip()
        try:
            weight = int(parts[1])
        except ValueError:
            continue  # 跳过权重不是数字的行
            
        # 添加到结果字典
        result[word] = weight
    
    # 转换为JSON字符串
    return json.dumps(result, ensure_ascii=False)

# ASR WebSocket处理
@app.websocket("/ws/asr")
async def asr_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # 生成唯一的连接ID
    connection_id = str(uuid.uuid4())
    asr_connections.append(websocket)
    funasr_websocket = None
    # 新增：连接状态跟踪变量
    asr_engine = None
    funasr_mode = None
    
    try:
        # 处理消息
        async for message in websocket.iter_json():
            msg_type = message.get("type")
            
            if msg_type == "init":
                # 加载设置
                settings = await load_settings()
                asr_settings = settings.get('asrSettings', {})
                asr_engine = asr_settings.get('engine', 'openai')  # 存储引擎类型
                if asr_engine == "funasr":
                    funasr_mode = asr_settings.get('funasr_mode', 'openai')  # 存储模式
                    if funasr_mode == "2pass" or funasr_mode == "online":
                        # 获取FunASR服务器地址
                        funasr_url = asr_settings.get('funasr_ws_url', 'ws://localhost:10095')
                        if not funasr_url.startswith('ws://') and not funasr_url.startswith('wss://'):
                            funasr_url = f"ws://{funasr_url}"
                        try:
                            funasr_websocket = await websockets.connect(funasr_url)
                        except Exception as e:
                            funasr_websocket = None
                            print(f"连接FunASR失败: {e}")
                await websocket.send_json({
                    "type": "init_response",
                    "status": "ready"
                })
                print("ASR WebSocket connected:",asr_engine)
            elif msg_type == "audio_start":
                frame_id = message.get("id")
                # 加载设置
                settings = await load_settings()
                asr_settings = settings.get('asrSettings', {})
                asr_engine = asr_settings.get('engine', 'openai')  # 存储引擎类型
                if asr_engine == "funasr":
                    funasr_mode = asr_settings.get('funasr_mode', '2pass')  # 存储模式
                    hotwords = asr_settings.get('hotwords', '')
                    if funasr_mode == "2pass":
                        # 获取FunASR服务器地址
                        funasr_url = asr_settings.get('funasr_ws_url', 'ws://localhost:10095')
                        if not funasr_url.startswith('ws://') and not funasr_url.startswith('wss://'):
                            funasr_url = f"ws://{funasr_url}"
                        try:
                            if not funasr_websocket:
                                # 连接到FunASR服务器 
                                funasr_websocket = await websockets.connect(funasr_url)
                            # 1. 发送初始化配置
                            init_config = {
                                "chunk_size": [5, 10, 5],
                                "wav_name": "python_client",
                                "is_speaking": True,
                                "chunk_interval": 10,
                                "mode": funasr_mode,  
                                "hotwords": hotwords_to_json(hotwords),
                                "use_itn": True
                            }
                            await funasr_websocket.send(json.dumps(init_config))
                            print("Sent init config")
                            # 2. 开启一个异步任务处理FunASR的响应
                            asyncio.create_task(handle_funasr_response(funasr_websocket, websocket))
                        except Exception as e:
                            print(f"连接FunASR失败: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"无法连接FunASR服务器: {str(e)}"
                            })
                            # 标记连接失败，避免后续操作
                            funasr_websocket = None
                    else:
                        # 关闭异步任务处理FunASR的响应
                        funasr_websocket = None
                else:
                    # 关闭异步任务处理FunASR的响应
                    funasr_websocket = None
            # 修改点：增加流式音频处理前的检查
            elif msg_type == "audio_stream":
                frame_id = message.get("id")
                audio_base64 = message.get("audio")

                # 关键检查：确保funasr_websocket已初始化
                if not funasr_websocket:
                    continue  # 跳过当前消息处理

                if audio_base64:
                    # 1. Base64 解码 → 得到二进制 PCM (Int16)
                    pcm_data = base64.b64decode(audio_base64)

                    # 2. 直接转发二进制给 FunASR
                    try:
                        await funasr_websocket.send(pcm_data)
                    except websockets.exceptions.ConnectionClosed:
                        funasr_websocket = None
                        # 加载设置
                        settings = await load_settings()
                        asr_settings = settings.get('asrSettings', {})
                        asr_engine = asr_settings.get('engine', 'openai')  # 存储引擎类型
                        if asr_engine == "funasr":
                            funasr_mode = asr_settings.get('funasr_mode', '2pass')  # 存储模式
                            if funasr_mode == "2pass":
                                # 获取FunASR服务器地址
                                funasr_url = asr_settings.get('funasr_ws_url', 'ws://localhost:10095')
                                if not funasr_url.startswith('ws://') and not funasr_url.startswith('wss://'):
                                    funasr_url = f"ws://{funasr_url}"
                                try:
                                    funasr_websocket = await websockets.connect(funasr_url)
                                except Exception as e:
                                    funasr_websocket = None
                                    print(f"连接FunASR失败: {e}")
            elif msg_type == "audio_complete":
                # 处理完整的音频数据（非流式模式）
                frame_id = message.get("id")
                audio_b64 = message.get("audio")
                audio_format = message.get("format", "wav")
                
                if audio_b64:
                    # 解码base64数据
                    audio_bytes = base64.b64decode(audio_b64)
                    print(f"Received audio data: {len(audio_bytes)} bytes, format: {audio_format}")
                    
                    try:
                        # 加载设置
                        settings = await load_settings()
                        asr_settings = settings.get('asrSettings', {})
                        asr_engine = asr_settings.get('engine', 'openai')
                        
                        result = ""
                        
                        if asr_engine == "openai":
                            # OpenAI ASR
                            audio_file = BytesIO(audio_bytes)
                            audio_file.name = f"audio.{audio_format}"
                            
                            client = AsyncOpenAI(
                                api_key=asr_settings.get('api_key', ''),
                                base_url=asr_settings.get('base_url', '') or "https://api.openai.com/v1"
                            )
                            response = await client.audio.transcriptions.create(
                                file=audio_file,
                                model=asr_settings.get('model', 'whisper-1'),
                            )
                            result = response.text
                            # 发送结果
                            await websocket.send_json({
                                "type": "transcription",
                                "id": frame_id,
                                "text": result,
                                "is_final": True
                            })
                        elif asr_engine == "funasr":
                            # FunASR
                            print("Using FunASR engine")
                            funasr_mode = asr_settings.get('funasr_mode', 'offline')
                            if funasr_mode == "offline":
                                result = await funasr_recognize(audio_bytes, asr_settings,websocket,frame_id)
                            else:
                                # 关键检查：确保连接有效
                                if not funasr_websocket:
                                    continue
                                
                                # 4. 发送结束信号
                                end_config = {
                                    "is_speaking": False  # 只需发送必要的结束标记
                                }
                                try:
                                    await funasr_websocket.send(json.dumps(end_config))
                                    print("Sent end signal")
                                except websockets.exceptions.ConnectionClosed:
                                    print("FunASR连接已关闭，无法发送结束信号")
                            funasr_websocket = None

                        elif asr_engine == "sherpa":
                            from py.sherpa_asr import sherpa_recognize
                            # 新增Sherpa处理
                            result = await sherpa_recognize(audio_bytes)
                            print(f"Sherpa result: {result}")
                            await websocket.send_json({
                                "type": "transcription",
                                "id": frame_id,
                                "text": result,
                                "is_final": True
                            })

                    except WebSocketDisconnect:
                        print(f"ASR WebSocket disconnected: {connection_id}")
                    except Exception as e:
                        print(f"ASR WebSocket error: {e}")
    finally:
        # 清理资源
        if connection_id in audio_buffer:
            del audio_buffer[connection_id]
        if websocket in asr_connections:
            asr_connections.remove(websocket)
        # 新增：确保关闭FunASR连接
        if funasr_websocket:
            await funasr_websocket.close()

@app.post("/asr")
async def asr_transcription(
    audio: UploadFile = File(...),
    format: str = Form(default="auto")
):
    """
    HTTP版本的ASR接口
    支持多种音频格式，根据配置自动选择ASR引擎
    """
    # 声明使用全局缓存
    global openai_asr_clients_cache, settings

    try:
        # 1. 读取上传的音频文件
        audio_bytes = await audio.read()
        print(f"Received audio file: {audio.filename}, size: {len(audio_bytes)} bytes")
        
        # 2. 自动检测格式
        if format == "auto":
            if audio.filename:
                file_ext = audio.filename.split('.')[-1].lower()
                format = file_ext if file_ext in ['wav', 'mp3', 'flac', 'ogg', 'm4a'] else 'wav'
            else:
                format = 'wav'
        
        # 3. 加载设置 (为了性能，可以直接使用全局变量 settings，或者重新加载)
        current_settings = await load_settings()
        asr_settings = current_settings.get('asrSettings', {})
        asr_engine = asr_settings.get('engine', 'openai')
        
        result = ""
        
        # ==========================================
        # ASR 引擎分支：OpenAI (Whisper)
        # ==========================================
        if asr_engine == "openai":
            api_key = asr_settings.get('api_key', '')
            base_url = asr_settings.get('base_url', '') or "https://api.openai.com/v1"
            
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI ASR API密钥未配置")

            # --- 核心改进：使用缓存的客户端 ---
            cache_key = (api_key, base_url)
            if cache_key not in openai_asr_clients_cache:
                print(f"Initializing new OpenAI ASR Client for: {base_url}")
                openai_asr_clients_cache[cache_key] = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url
                )
            client = openai_asr_clients_cache[cache_key]
            # --------------------------------

            print(f"Using OpenAI ASR engine ({asr_settings.get('model', 'whisper-1')})")
            
            # 包装音频数据
            audio_file = BytesIO(audio_bytes)
            # OpenAI SDK 要求文件必须有特定的名字后缀来判断类型
            audio_file.name = f"audio.{format}"
            
            response = await client.audio.transcriptions.create(
                file=audio_file,
                model=asr_settings.get('model', 'whisper-1'),
            )
            result = response.text
            
        # ==========================================
        # ASR 引擎分支：FunASR
        # ==========================================
        elif asr_engine == "funasr":
            print("Using FunASR engine (offline mode)")
            # 假设 funasr_recognize_offline 内部已处理好性能问题
            result = await funasr_recognize_offline(audio_bytes, asr_settings)
            
        # ==========================================
        # ASR 引擎分支：Sherpa (本地)
        # ==========================================
        elif asr_engine == "sherpa":
            from py.sherpa_asr import sherpa_recognize
            print("Using Sherpa ASR engine")
            # Sherpa 通常是本地模型推理，损耗在于 CPU/GPU，不在连接建立
            result = await sherpa_recognize(audio_bytes)
        

        else:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"不支持的ASR引擎: {asr_engine}",
                    "text": ""
                }
            )
        
        # 4. 返回识别结果
        return JSONResponse(
            content={
                "success": True,
                "text": result.strip() if result else "",
                "engine": asr_engine,
                "format": format
            }
        )
        
    except Exception as e:
        print(f"ASR HTTP interface error: {e}")
        import traceback
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "text": ""
            }
        )

async def funasr_recognize_offline(audio_data: bytes, funasr_settings: dict) -> str:
    """
    FunASR离线识别（专为HTTP接口优化）
    """
    try:
        # 获取FunASR服务器地址
        funasr_url = funasr_settings.get('funasr_ws_url', 'ws://localhost:10095')
        hotwords = funasr_settings.get('hotwords', '')
        if not funasr_url.startswith('ws://') and not funasr_url.startswith('wss://'):
            funasr_url = f"ws://{funasr_url}"
        
        # 连接到FunASR服务器
        async with websockets.connect(funasr_url) as websocket:
            print(f"Connected to FunASR server: {funasr_url}")
            
            # 1. 发送初始化配置（强制离线模式）
            init_config = {
                "chunk_size": [5, 10, 5],
                "wav_name": "http_client",
                "is_speaking": True,
                "chunk_interval": 10,
                "mode": "offline",  # 强制使用离线模式
                "hotwords": hotwords_to_json(hotwords),
                "use_itn": True
            }
            
            await websocket.send(json.dumps(init_config))
            print("Sent init config for offline mode")
            
            # 2. 转换音频数据为PCM16格式
            pcm_data = convert_audio_to_pcm16(audio_data)
            print(f"PCM data length: {len(pcm_data)} bytes")
            
            # 3. 分块发送音频数据
            chunk_size = 960  # 30ms的音频数据
            total_sent = 0
            
            while total_sent < len(pcm_data):
                chunk_end = min(total_sent + chunk_size, len(pcm_data))
                chunk = pcm_data[total_sent:chunk_end]
                await websocket.send(chunk)
                total_sent = chunk_end
            
            print(f"Sent all audio data: {total_sent} bytes")
            
            # 4. 发送结束信号
            end_config = {
                "is_speaking": False,
            }
            await websocket.send(json.dumps(end_config))
            print("Sent end signal")
            
            # 5. 等待识别结果
            result_text = ""
            timeout_count = 0
            max_timeout = 300  # 最大等待30秒（HTTP接口可以等待更久）
            
            while timeout_count < max_timeout:
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                    
                    try:
                        json_response = json.loads(response)
                        print(f"Received response: {json_response}")
                        
                        if 'text' in json_response:
                            text = json_response['text']
                            if text and text.strip():
                                result_text += text
                                print(f"Got text: {text}")
                            
                            # 检查是否为最终结果
                            if json_response.get('is_final', False):
                                print("Got final result")
                                break
                                
                    except json.JSONDecodeError:
                        # 忽略非JSON格式的响应
                        pass
                        
                except asyncio.TimeoutError:
                    timeout_count += 1
                    continue
                except websockets.exceptions.ConnectionClosed:
                    print("WebSocket connection closed")
                    break
            
            if not result_text:
                print("No recognition result received")
                return ""
            
            return result_text.strip()
            
    except Exception as e:
        print(f"FunASR offline recognition error: {e}")
        return f"FunASR识别错误: {str(e)}"


async def handle_funasr_response(funasr_websocket, 
                               client_websocket: WebSocket):
    """
    处理 FunASR 服务器的响应，并将结果转发给客户端
    """
    try:
        async for message in funasr_websocket:
            try:
                if funasr_websocket:
                    # FunASR 返回的数据可能是 JSON 或二进制
                    if isinstance(message, bytes):
                        message = message.decode('utf-8')
                    
                    data = json.loads(message)
                    print(f"FunASR response: {data}")
                    # 解析 FunASR 响应
                    if "text" in data:  # 普通识别结果
                        if data.get('mode', '') == "2pass-online":
                            await client_websocket.send_json({
                                "type": "transcription",
                                "text": data["text"],
                                "is_final": False
                            })
                        else:
                            await client_websocket.send_json({
                                "type": "transcription",
                                "text": data["text"],
                                "is_final": True
                            })
                    elif "mode" in data:  # 初始化响应
                        print(f"FunASR initialized: {data}")
                    else:
                        print(f"Unknown FunASR response: {data}")
                else:
                    # 如果 FunASR 连接关闭，发送错误消息，退出循环，结束任务
            
                    break
            except json.JSONDecodeError:
                print(f"FunASR sent non-JSON data: {message[:100]}...")
            except Exception as e:
                print(f"Error processing FunASR response: {e}")
                break

    except websockets.exceptions.ConnectionClosed:
        print("FunASR connection closed")
    except Exception as e:
        print(f"FunASR handler error: {e}")
    finally:
        await funasr_websocket.close()

class TTSConnectionManager:
    def __init__(self):
        self.main_connections: List[WebSocket] = []
        self.vrm_connections: List[WebSocket] = []
        self.tha_connections: List[WebSocket] = []
        self.overlay_connections: list[WebSocket] = []

    async def connect_main(self, websocket: WebSocket):
        await websocket.accept()
        self.main_connections.append(websocket)
        logging.info(f"Main interface connected. Total: {len(self.main_connections)}")

    async def connect_vrm(self, websocket: WebSocket):
        await websocket.accept()
        self.vrm_connections.append(websocket)
        logging.info(f"VRM interface connected. Total: {len(self.vrm_connections)}")

    async def connect_tha(self, websocket: WebSocket):
        await websocket.accept()
        self.tha_connections.append(websocket)
        logging.info(f"THA interface connected. Total: {len(self.tha_connections)}")

    def disconnect_main(self, websocket: WebSocket):
        if websocket in self.main_connections:
            self.main_connections.remove(websocket)

    def disconnect_vrm(self, websocket: WebSocket):
        if websocket in self.vrm_connections:
            self.vrm_connections.remove(websocket)

    def disconnect_tha(self, websocket: WebSocket):
        if websocket in self.tha_connections:
            self.tha_connections.remove(websocket)

    async def broadcast_to_vrm(self, message: Union[str, bytes]):
        """核心：同时支持字符串 JSON 和二进制 Blob 透传"""
        if not self.vrm_connections:
            return
        disconnected = []
        for connection in self.vrm_connections:
            try:
                if isinstance(message, bytes):
                    await connection.send_bytes(message)
                else:
                    await connection.send_text(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_vrm(conn)

    async def send_to_main(self, message: str):
        if not self.main_connections:
            return
        disconnected = []
        for connection in self.main_connections:
            try:
                await connection.send_text(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_main(conn)

    async def connect_overlay(self, websocket: WebSocket):
        """字幕页专用连接"""
        await websocket.accept()
        self.overlay_connections.append(websocket)

    def disconnect_overlay(self, websocket: WebSocket):
        if websocket in self.overlay_connections:
            self.overlay_connections.remove(websocket)

    async def broadcast_to_vrm(self, message: Union[str, bytes]):
        """核心广播逻辑：区分发送内容"""
        # 1. 如果是二进制（音频流），只发给真正的 VRM 页面
        if isinstance(message, bytes):
            for conn in list(self.vrm_connections):
                try: await conn.send_bytes(message)
                except: self.disconnect_vrm(conn)
        
        # 2. 如果是字符串（指令/文字），发给 VRM 和字幕页面
        else:
            for conn in list(self.vrm_connections):
                try: await conn.send_text(message)
                except: self.disconnect_vrm(conn)
            
            for conn in list(self.overlay_connections):
                try: await conn.send_text(message)
                except: self.disconnect_overlay(conn)

    async def broadcast_emotion_to_tha(self, emotion: str):
        """直接向所有 THA 姿态生成器发送表情/动作指令（单标签，兼容旧调用）"""
        await self.broadcast_expressions_to_tha([emotion])

    async def broadcast_expressions_to_tha(self, expressions: list):
        """解析带权重的表情标签列表并混合广播；动作标签一次性触发。

        支持格式："happy"（权重1.0）、"happy:0.3"（加权），
        多个表情标签通过 compose_emotion_pose 加权混合，避免冲突。
        """
        from py.tha_engine import THA_MOTIONS

        # 去重快速路径：omniStreaming 每个流式增量都重发累积标签列表，
        # 绝大多数增量标签无变化，一次列表比较（微秒级）即可跳过全部
        # 解析/合成/广播工作，比无条件重算显著省时。
        # 新列表以上次为前缀 → 只处理新增尾部（新情绪切换）；否则全量处理。
        exps = [str(e) for e in expressions]
        prev = getattr(self, '_last_tha_expressions', None)
        if prev == exps:
            return
        if prev is not None and len(exps) > len(prev) and exps[:len(prev)] == prev:
            batch = exps[len(prev):]
        else:
            batch = exps
        self._last_tha_expressions = exps

        weights = {}
        motions = []
        for exp in batch:
            name, sep, w = exp.partition(':')
            name = name.strip()
            if name in THA_MOTIONS:
                motions.append(name)
            elif not sep or not w.strip():
                # 裸标签（<happy>）= 切换语义：重置已累积的权重，
                # 与旧版逐个 set_emotion 的"最后一个标签生效"行为一致
                weights = {name: 1.0}
            else:
                # 带权重标签（<happy:0.3>）= 有意混合，累加
                try:
                    weights[name] = float(w)
                except ValueError:
                    continue
        conns = list(self.tha_connections)
        for conn in conns:
            try:
                gen = getattr(conn, '_tha_gen', None)
                if gen:
                    if weights:
                        gen.set_emotion_mix(weights)
                    for m in motions:
                        gen.set_motion(m)
            except:
                self.disconnect_tha(conn)


tts_manager = TTSConnectionManager()

async def broadcast_to_vrm(self, message: Union[str, bytes]):
    if not self.vrm_connections:
        return
    disconnected = []
    for connection in self.vrm_connections:
        try:
            if isinstance(message, bytes):
                await connection.send_bytes(message)
            else:
                await connection.send_text(message)
        except:
            disconnected.append(connection)
    for conn in disconnected:
        self.disconnect_vrm(conn)

from py.vts_manager import vts_instance

@app.websocket("/ws/tts")
async def tts_websocket_endpoint(websocket: WebSocket):
    await tts_manager.connect_main(websocket)
    try:
        while True:
            msg = await websocket.receive()
            
            # 1. 处理二进制（音频流）
            if "bytes" in msg:
                data_bytes = msg["bytes"]
                if len(data_bytes) > 4:
                    try:
                        json_len = struct.unpack('<I', data_bytes[:4])[0]
                        metadata_bytes = data_bytes[4 : 4 + json_len]
                        audio_file_bytes = data_bytes[4 + json_len :]
                        
                        if vts_instance.is_running and len(audio_file_bytes) > 0:
                            import subprocess
                            import imageio_ffmpeg  
                            def decode_audio_to_pcm(b_data):
                                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                                process = subprocess.Popen([
                                    ffmpeg_exe,
                                    '-i', 'pipe:0',       
                                    '-f', 's16le',        
                                    '-ar', '24000',       
                                    '-ac', '1',           
                                    'pipe:1'              
                                ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                                pcm_raw_bytes, _ = process.communicate(input=b_data)
                                return pcm_raw_bytes

                            pcm_raw_bytes = await asyncio.to_thread(decode_audio_to_pcm, audio_file_bytes)
                            if pcm_raw_bytes:
                                asyncio.create_task(vts_instance.drive_mouth(pcm_raw_bytes))
                        
                        await tts_manager.broadcast_to_vrm(data_bytes)
                    except Exception as e:
                        logging.error(f"万能音频解码出错: {e}")
            
            # 2. 处理文本（指令/表情）
            elif "text" in msg:
                try:
                    payload = json.loads(msg["text"]) 
                    msg_type = payload.get("type")
                    
                    # === 【新增】在每次语音会话重新开始时，清空 VTS 的历史防抖标记集 ===
                    if msg_type in ["ttsStarted", "startSpeaking"]:
                        if hasattr(vts_instance, "triggered_tags_in_session"):
                            vts_instance.triggered_tags_in_session.clear()
                        # THA 表情重置（TTS开始时回到中立表情）
                        if msg_type == "ttsStarted":
                            asyncio.create_task(tts_manager.broadcast_emotion_to_tha("neutral"))
                    
                    if msg_type == "startVTS_Driver":
                        success = await vts_instance.connect(payload.get("data", {}))
                        feedback = {
                            "type": "vts_connection_status",
                            "data": {
                                "success": success,
                                "message": "Connected to VTube Studio" if success else "Failed to connect. Please make sure VTube Studio is running and the API is enabled."
                            }
                        }
                        await websocket.send_text(json.dumps(feedback))
                        
                    elif msg_type == "stopVTS_Driver":
                        await vts_instance.stop()
                        await websocket.send_text(json.dumps({
                            "type": "vts_connection_status",
                            "data": {"success": False, "message": "VTS Disconnected"}
                        }))
                    elif msg_type == "startSpeaking":
                        data_content = payload.get("data", {})
                        expressions = data_content.get("expressions",[])
                        if vts_instance.is_running:
                            for exp in expressions:
                                exp = str(exp)
                                name, sep, w = exp.partition(':')
                                # 仅当冒号后缀是数值权重（happy:0.5）时才剥离；
                                # 含冒号的普通热键名（emote:wave）原样传递
                                hotkey = name if (sep and re.fullmatch(r'\s*\d*\.?\d+\s*', w)) else exp
                                asyncio.create_task(vts_instance.trigger_hotkey(hotkey))
                        # THA 表情广播（整组交给 composer 加权混合）
                        if expressions:
                            asyncio.create_task(tts_manager.broadcast_expressions_to_tha(expressions))

                    # === 【新增】TTS 禁用时，流式文本(omniStreaming)携带的动作表情触发支持 ===
                    elif msg_type == "omniStreaming":
                        data_content = payload.get("data", {})
                        expressions = data_content.get("expressions", [])
                        if vts_instance.is_running:
                            for exp in expressions:
                                exp = str(exp)
                                name, sep, w = exp.partition(':')
                                # 仅当冒号后缀是数值权重（happy:0.5）时才剥离；
                                # 含冒号的普通热键名（emote:wave）原样传递
                                hotkey = name if (sep and re.fullmatch(r'\s*\d*\.?\d+\s*', w)) else exp
                                asyncio.create_task(vts_instance.trigger_hotkey(hotkey))
                        # THA 表情广播（整组交给 composer 加权混合）
                        if expressions:
                            asyncio.create_task(tts_manager.broadcast_expressions_to_tha(expressions))

                    await tts_manager.broadcast_to_vrm(msg["text"])
                except Exception as e:
                    logging.error(f"[PY] WS Text Error: {e}")

    except Exception as e:
        logging.error(f"[PY] WS Global Error: {e}")
    finally:
        tts_manager.disconnect_main(websocket)

@app.websocket("/ws/vrm")
async def vrm_websocket_endpoint(websocket: WebSocket):
    """VRM 窗口 WebSocket：接收主窗口发来的数据"""
    await tts_manager.connect_vrm(websocket)
    try:
        while True:
            msg = await websocket.receive()
            if "text" in msg:
                # 处理来自 VRM 的反馈（如 requestAudioData 或 animationComplete）
                data = json.loads(msg["text"])
                if data.get('type') == 'animationComplete':
                    await tts_manager.send_to_main(msg["text"])
            # VRM 窗口通常不主动给主窗口发二进制，所以这里暂不处理 bytes
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        logging.error(f"WS error in VRM: {e}")
    finally:
        tts_manager.disconnect_vrm(websocket)

@app.websocket("/ws/tha")
async def tha_websocket_endpoint(websocket: WebSocket):
    """THA 桌面宠物 WebSocket：接收控制指令，返回 JPEG 帧"""
    from py.tha_engine import THAPoseGenerator, get_engine, clear_engine_cache

    settings = await load_settings()
    tha_config = settings.get("THAConfig", {})
    selected_id = tha_config.get("selectedModelId", "Lyra")
    sr_mode = tha_config.get("srMode", "cnnx2vl")
    jpeg_quality = 90 if sr_mode != "off" else 50

    # 1. 查找模型路径（macOS: .mlpackage 优先，非macOS: 仅 .onnx）
    is_mac = (sys.platform == 'darwin')

    def _find_model_in(scan_dir):
        try:
            for entry in os.listdir(scan_dir):
                entry_path = os.path.join(scan_dir, entry)
                if os.path.isdir(entry_path) and entry == selected_id:
                    if is_mac:
                        mlp = os.path.join(entry_path, "model.mlpackage")
                        if os.path.isdir(mlp):
                            return mlp
                    mp = os.path.join(entry_path, "model.onnx")
                    if os.path.exists(mp):
                        return mp
        except FileNotFoundError:
            pass
        return None

    model_path = _find_model_in(os.path.join(base_path, "tha_models"))
    if not model_path:
        model_path = _find_model_in(THA_USER_MODELS_DIR)

    if not model_path:
        logging.error(f"[THA WS] Model not found: {selected_id}")
        await websocket.accept()
        await websocket.close()
        return

    try:
        engine = get_engine(model_path)
        gen = THAPoseGenerator()

        await tts_manager.connect_tha(websocket)
        websocket._tha_gen = gen

        # 2. 接收控制流 Task
        async def recv_loop():
            try:
                while True:
                    msg = await websocket.receive_text()
                    data = json.loads(msg)
                    cmd_type = data.get("type", "")
                    if cmd_type == "emotion":
                        gen.set_emotion(data.get("emotion", "neutral"))
                    elif cmd_type == "motion":
                        gen.set_motion(data.get("motion", ""))
                    elif cmd_type == "motionClear":
                        gen.clear_motion()
                    elif cmd_type == "mouth":
                        gen.set_mouth(float(data.get("amplitude", 0)))
                    elif cmd_type == "mouse":
                        gen.set_mouse(float(data.get("x", 0)), float(data.get("y", 0)))
            except WebSocketDisconnect:
                return
            except Exception as e:
                logging.error(f"[THA WS] Instruction receive error: {e}")

        # 3. 渲染发送流 Task
        async def render_loop():
            target_fps = 30
            frame_interval = 1.0 / target_fps
            loop = asyncio.get_running_loop()
            
            try:
                while True:
                    start_time = time.perf_counter()
                    
                    pose = gen.step()
                    jpeg = await loop.run_in_executor(None, engine.render, pose, jpeg_quality)
                    
                    await websocket.send_bytes(jpeg)
                    
                    elapsed = time.perf_counter() - start_time
                    sleep_time = max(0.0, frame_interval - elapsed)
                    await asyncio.sleep(sleep_time)
            except WebSocketDisconnect:
                return
            except Exception as e:
                logging.error(f"[THA WS] Frame render error: {e}")

        # 4. 建立并发任务监听 (此处已修正变量名称为 recv_loop)
        recv_task = asyncio.create_task(recv_loop())
        render_task = asyncio.create_task(render_loop())

        done, pending = await asyncio.wait(
            [recv_task, render_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logging.error(f"[THA WS] Main loop runtime error: {e}")
    finally:
        tts_manager.disconnect_tha(websocket)

@app.websocket("/ws/subtitles")
async def subtitles_websocket_endpoint(websocket: WebSocket):
    """字幕叠加层专用端点：不参与音频播放判断"""
    await tts_manager.connect_overlay(websocket)
    try:
        while True:
            await websocket.receive_text() # 保持心跳
    except WebSocketDisconnect:
        tts_manager.disconnect_overlay(websocket)

# 修改状态接口，让前端也能感知 VTS 是否连接（虽然不影响静音判断）
@app.get("/tts/status")
async def get_tts_status():
    return {
        "vrm_connections": len(tts_manager.vrm_connections),
        "vts_active": vts_instance.is_running, # 新增
        "overlay_connections": len(tts_manager.overlay_connections),
        "main_connections": len(tts_manager.main_connections)
    }

@app.post("/tts")
async def text_to_speech(request: Request):
    import edge_tts
    import subprocess
    
    # 声明全局缓存和客户端
    global global_http_client, openai_tts_clients_cache, tetos_speakers_cache

    try:
        data = await request.json()
        text = data.get('text', '')
        if not text:
            return JSONResponse(status_code=400, content={"error": "Text is empty"})
        
        # 移动端专用：强制使用opus格式
        mobile_optimized = data.get('mobile_optimized', False)
        target_format = "opus" if mobile_optimized else data.get('format', 'mp3')
        
        new_voice = data.get('voice', 'default')
        tts_settings = data.get('ttsSettings', {})
        
        # 处理声音配置继承逻辑
        if new_voice in tts_settings.get('newtts', {}) and new_voice != 'default':
            voice_settings = tts_settings['newtts'][new_voice]
            parent_settings = tts_settings
            
            inherited_fields = ['api_key', 'base_url', 'model', 'selectedProvider', 'vendor']
            for field in inherited_fields:
                child_value = voice_settings.get(field, '')
                parent_value = parent_settings.get(field, '')
                if not child_value and parent_value:
                    voice_settings[field] = parent_value
            
            selected_provider_id = voice_settings.get('selectedProvider')
            if selected_provider_id and not voice_settings.get('api_key'):
                model_providers = parent_settings.get('modelProviders', [])
                for provider in model_providers:
                    if provider.get('id') == selected_provider_id:
                        voice_settings['api_key'] = provider.get('apiKey', '')
                        voice_settings['base_url'] = provider.get('url', '')
                        voice_settings['model'] = provider.get('modelId', '')
                        voice_settings['vendor'] = provider.get('vendor', '')
                        break
            tts_settings = voice_settings

        index = data.get('index', 0)
        tts_engine = tts_settings.get('engine', 'edgetts')
                
        print(f"TTS请求 - 引擎: {tts_engine}, 格式: {target_format}, 移动端优化: {mobile_optimized}")
                
        # ==========================================
        # 1. EdgeTTS 引擎
        # ==========================================
        if tts_engine == 'edgetts':
            if _is_steam_build:
                return JSONResponse({"error": "EdgeTTS is not available in this build"}, status_code=403)
            edgettsLanguage = tts_settings.get('edgettsLanguage', 'zh-CN')
            edgettsVoice = tts_settings.get('edgettsVoice', 'XiaoyiNeural')
            rate = tts_settings.get('edgettsRate', 1.0)
            full_voice_name = f"{edgettsLanguage}-{edgettsVoice}"
            
            if mobile_optimized:
                rate = min(rate * 0.95, 1.1)
            
            rate_text = "+0%"
            if rate >= 1.0:
                rate_text = f"+{int((rate - 1.0) * 100)}%"
            elif rate < 1.0:
                rate_text = f"-{int((1.0 - rate) * 100)}%"
            
            async def generate_audio():
                communicate = edge_tts.Communicate(text, full_voice_name, rate=rate_text)
                if target_format == "opus":
                    audio_chunks = []
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            audio_chunks.append(chunk["data"])
                    
                    full_audio = b''.join(audio_chunks)
                    convert_result = await asyncio.to_thread(convert_to_opus_simple, full_audio)
                    opus_audio = convert_result[0] if isinstance(convert_result, tuple) else convert_result
                    
                    chunk_size = 4096
                    for i in range(0, len(opus_audio), chunk_size):
                        yield opus_audio[i:i + chunk_size]
                else:
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            yield chunk["data"]

            media_type = "audio/ogg" if target_format == "opus" else "audio/mpeg"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.mp3"
            
            return StreamingResponse(
                generate_audio(),
                media_type=media_type,
                headers={"Content-Disposition": f"inline; filename={filename}", "X-Audio-Index": str(index), "X-Audio-Format": target_format}
            )

        # ==========================================
        # 2. CustomTTS 引擎 (使用全局连接池)
        # ==========================================
        elif tts_engine == 'customTTS':
            key_text = tts_settings.get('customTTSKeyText', 'text')
            key_speaker = tts_settings.get('customTTSKeySpeaker', 'speaker')
            key_speed = tts_settings.get('customTTSKeySpeed', 'speed')
            speaker_value = tts_settings.get('customTTSspeaker', '')
            speed_value = tts_settings.get('customTTSspeed', 1.0)
            
            if mobile_optimized:
                speed_value = min(speed_value * 0.95, 1.2)

            params = {key_text: text, key_speaker: speaker_value, key_speed: speed_value}
            servers = [s for s in tts_settings.get('customTTSserver', 'http://127.0.0.1:9880').split('\n') if s.strip()]
            custom_tt_server = servers[index % len(servers)]
            custom_streaming = tts_settings.get('customStream', False)
            
            async def generate_audio():
                safe_url = sanitize_url(input_url=custom_tt_server, default_base="http://127.0.0.1:9880", endpoint="")
                try:
                    # 使用全局客户端，无需 async with httpx.AsyncClient()
                    async with global_http_client.stream("GET", safe_url, params=params) as response:
                        response.raise_for_status()
                        if custom_streaming:
                            async for chunk in response.aiter_bytes():
                                yield chunk
                        else:
                            audio_data = await response.aread()
                            if target_format == "opus":
                                convert_result = await asyncio.to_thread(convert_to_opus_simple, audio_data)
                                audio_data = convert_result[0] if isinstance(convert_result, tuple) else convert_result
                            
                            chunk_size = 4096
                            for i in range(0, len(audio_data), chunk_size):
                                yield audio_data[i:i + chunk_size]
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"Custom TTS 连接失败: {str(e)}")

            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.wav"
            return StreamingResponse(generate_audio(), media_type=media_type, headers={"Content-Disposition": f"inline; filename={filename}", "X-Audio-Index": str(index)})

        # ==========================================
        # 3. GSV 引擎 (使用全局连接池)
        # ==========================================
        elif tts_engine == 'GSV':
            audio_path = os.path.join(UPLOAD_FILES_DIR, tts_settings.get('gsvRefAudioPath', ''))
            if not os.path.exists(audio_path): audio_path = tts_settings.get('gsvRefAudioPath', '')

            gsv_params = {
                "text": text, "text_lang": tts_settings.get('gsvTextLang', 'zh'),
                "ref_audio_path": audio_path, "prompt_lang": tts_settings.get('gsvPromptLang', 'zh'),
                "prompt_text": tts_settings.get('gsvPromptText', ''), "speed_factor": tts_settings.get('gsvRate', 1.0),
                "sample_steps": tts_settings.get('gsvSample_steps', 4), "streaming_mode": True,
                "media_type": "ogg", "batch_size": 1, "seed": 42,
            }
            if mobile_optimized: gsv_params["speed_factor"] = min(gsv_params["speed_factor"] * 0.95, 1.1)
            
            servers = [s for s in tts_settings.get('gsvServer', 'http://127.0.0.1:9880').split('\n') if s.strip()]
            gsvServer = servers[index % len(servers)]
                
            async def generate_audio():
                safe_url = sanitize_url(input_url=gsvServer, default_base="http://127.0.0.1:9880", endpoint="/tts")
                try:
                    async with global_http_client.stream("POST", safe_url, json=gsv_params) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_bytes():
                            yield chunk
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"GSV服务错误: {str(e)}")
            
            return StreamingResponse(generate_audio(), media_type="audio/ogg", headers={"Content-Disposition": f"inline; filename=tts_{index}.opus"})

        # ==========================================
        # 4. 火山引擎 (使用全局连接池)
        # ==========================================
        elif tts_engine == 'volcengine':
            volc_app_id = tts_settings.get('volcAppId', '')
            volc_access_key = tts_settings.get('volcAccessKey', '')
            volc_resource_id = tts_settings.get('volcResourceId', 'volc_tts_release') 
            volc_voice = tts_settings.get('volcVoice', 'zh_female_cancan_mars_bigtts')
            volc_rate = float(tts_settings.get('volcRate', 1.0))
            if mobile_optimized: volc_rate = min(volc_rate * 0.95, 1.2)
            
            url = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
            headers = {"X-Api-App-Id": volc_app_id, "X-Api-Access-Key": volc_access_key, "X-Api-Resource-Id": volc_resource_id, "Content-Type": "application/json"}
            payload = {
                "user": {"uid": "123456"},
                "req_params": {
                    "text": text, "speaker": volc_voice, "speed_ratio": volc_rate, 
                    "audio_params": {"format": "mp3", "sample_rate": 24000},
                    "additions": "{\"disable_markdown_filter\":true}" 
                }
            }

            async def generate_audio():
                try:
                    async with global_http_client.stream("POST", url, headers=headers, json=payload) as response:
                        response.raise_for_status()
                        collected_audio = bytearray()
                        async for line in response.aiter_lines():
                            if not line: continue
                            data = json.loads(line)
                            if data.get("code", 0) != 0 and data.get("code", 0) != 20000000: continue
                            if "data" in data and data["data"]:
                                chunk_audio = base64.b64decode(data["data"])
                                if target_format == "opus": collected_audio.extend(chunk_audio)
                                else: yield chunk_audio
                        
                        if target_format == "opus" and collected_audio:
                            res = await asyncio.to_thread(convert_to_opus_simple, bytes(collected_audio))
                            final = res[0] if isinstance(res, tuple) else res
                            for i in range(0, len(final), 4096): yield final[i:i + 4096]
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"火山引擎错误: {str(e)}")

            media_type = "audio/ogg" if target_format == "opus" else "audio/mpeg"
            return StreamingResponse(generate_audio(), media_type=media_type)

        # ==========================================
        # 5. OpenAI TTS (使用实例缓存)
        # ==========================================
        elif tts_engine == 'openai':
            api_key = tts_settings.get('api_key', '')
            base_url = tts_settings.get('base_url', 'https://api.openai.com/v1')
            if not api_key: raise HTTPException(status_code=400, detail="API密钥未配置")
            
            # 获取或创建缓存的客户端
            cache_key = (api_key, base_url)
            if cache_key not in openai_tts_clients_cache:
                openai_tts_clients_cache[cache_key] = AsyncOpenAI(api_key=api_key, base_url=base_url)
            client = openai_tts_clients_cache[cache_key]

            speed = float(tts_settings.get('openaiSpeed', 1.0))
            if mobile_optimized: speed = min(speed * 0.95, 1.2)
            
            async def generate_audio():
                response_format = target_format if target_format in ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] else 'mp3'
                params = {'model': tts_settings.get('model', 'tts-1'), 'input': text, 'speed': max(0.25, min(4.0, speed)), 'response_format': response_format}
                
                ref_audio = tts_settings.get('gsvRefAudioPath', '')
                if ref_audio:
                    audio_file_path = os.path.join(UPLOAD_FILES_DIR, ref_audio)
                    audio_base64 = base64.b64encode(open(audio_file_path, "rb").read()).decode('utf-8')
                    params['extra_body'] = {"references": [{"text": tts_settings.get('gsvPromptText', ''), "audio": f"data:audio/{Path(audio_file_path).suffix[1:]};base64,{audio_base64}"}]}
                else:
                    params['voice'] = tts_settings.get('openaiVoice', 'alloy')

                if tts_settings.get('openaiStream', False):
                    async with client.audio.speech.with_streaming_response.create(**params) as response:
                        async for chunk in response.iter_bytes(chunk_size=4096): yield chunk
                else:
                    response = await client.audio.speech.create(**params)
                    content = await response.aread()
                    for i in range(0, len(content), 4096): yield content[i:i + 4096]

            media_map = {"opus": "audio/ogg", "wav": "audio/wav", "aac": "audio/aac", "flac": "audio/flac"}
            return StreamingResponse(generate_audio(), media_type=media_map.get(target_format, "audio/mpeg"))

        # ==========================================
        # 6. System TTS (系统原生)
        # ==========================================
        elif tts_engine == 'systemtts':
            system_voice_name = tts_settings.get('systemVoiceName', None)
            system_rate = int(tts_settings.get('systemRate', 200))
            if mobile_optimized: system_rate = int(system_rate * 0.95)
            
            def sync_generate_wav(input_text, voice_name, rate, req_index):
                temp_filename = os.path.join(TOOL_TEMP_DIR, f"temp_tts_{req_index}_{uuid.uuid4().hex[:8]}.wav")
                wav_data = b""
                try:
                    if platform.system() == 'Darwin':
                        cmd = ['say', '-o', temp_filename, '--data-format=LEI16@22050', input_text]
                        if voice_name: cmd.extend(['-v', voice_name])
                        if rate: cmd.extend(['-r', str(rate)])
                        subprocess.run(cmd, check=True)
                    else:
                        import pyttsx3
                        engine = pyttsx3.init()
                        engine.setProperty('rate', rate)
                        if voice_name:
                            for v in engine.getProperty('voices'):
                                if voice_name.lower() in v.name.lower() or voice_name == v.id:
                                    engine.setProperty('voice', v.id); break
                        engine.save_to_file(input_text, temp_filename)
                        engine.runAndWait()
                    if os.path.exists(temp_filename): wav_data = open(temp_filename, 'rb').read()
                finally:
                    if os.path.exists(temp_filename): os.remove(temp_filename)
                return wav_data

            async def generate_audio():
                wav_content = await asyncio.to_thread(sync_generate_wav, text, system_voice_name, system_rate, index)
                final = wav_content
                if target_format == "opus":
                    res = await asyncio.to_thread(convert_to_opus_simple, wav_content)
                    final = res[0] if isinstance(res, tuple) else res
                for i in range(0, len(final), 4096): yield final[i:i + 4096]
            
            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            return StreamingResponse(generate_audio(), media_type=media_type)

        # ==========================================
        # 7. Tetos SDK (Azure, 百度, 谷歌, Fish, etc. - 使用实例缓存)
        # ==========================================
        elif tts_engine in ['azure', 'baidu', 'minimax', 'xunfei', 'fish', 'google']:
            selected_voice = tts_settings.get(f'{tts_engine}Voice', '') or None
            
            # 根据引擎生成缓存Key
            if tts_engine == 'azure': cache_key = (tts_engine, tts_settings.get('azureSpeechKey'), tts_settings.get('azureRegion'), selected_voice)
            elif tts_engine == 'baidu': cache_key = (tts_engine, tts_settings.get('baiduApiKey'), tts_settings.get('baiduSecretKey'), selected_voice)
            elif tts_engine == 'minimax': cache_key = (tts_engine, tts_settings.get('minimaxApiKey'), tts_settings.get('minimaxGroupId'), selected_voice)
            elif tts_engine == 'xunfei': cache_key = (tts_engine, tts_settings.get('xunfeiAppId'), tts_settings.get('xunfeiApiKey'), tts_settings.get('xunfeiApiSecret'), selected_voice)
            elif tts_engine == 'fish': cache_key = (tts_engine, tts_settings.get('fishApiKey'), selected_voice)
            elif tts_engine == 'google': cache_key = (tts_engine, hash(tts_settings.get('googleServiceAccount', '')), selected_voice)
            else: cache_key = None

            temp_filename = os.path.join(TOOL_TEMP_DIR, f"temp_tetos_{index}_{uuid.uuid4().hex[:8]}.mp3")

            def run_tetos_sync():
                if cache_key in tetos_speakers_cache:
                    speaker = tetos_speakers_cache[cache_key]
                else:
                    if tts_engine == 'azure':
                        from tetos.azure import AzureSpeaker
                        speaker = AzureSpeaker(speech_key=cache_key[1], speech_region=cache_key[2], voice=selected_voice)
                    elif tts_engine == 'baidu':
                        from tetos.baidu import BaiduSpeaker
                        speaker = BaiduSpeaker(api_key=cache_key[1], secret_key=cache_key[2], voice=selected_voice)
                    elif tts_engine == 'minimax':
                        from tetos.minimax import MinimaxSpeaker
                        speaker = MinimaxSpeaker(api_key=cache_key[1], group_id=cache_key[2], voice=selected_voice)
                    elif tts_engine == 'xunfei':
                        from tetos.xunfei import XunfeiSpeaker
                        speaker = XunfeiSpeaker(app_id=cache_key[1], api_key=cache_key[2], api_secret=cache_key[3], voice=selected_voice)
                    elif tts_engine == 'fish':
                        from tetos.fish import FishSpeaker
                        speaker = FishSpeaker(api_key=cache_key[1], voice=selected_voice)
                    elif tts_engine == 'google':
                        from tetos.google import GoogleSpeaker
                        sa_json = tts_settings.get('googleServiceAccount', '')
                        if sa_json:
                            import tempfile
                            with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as tmp:
                                tmp.write(sa_json); os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
                        speaker = GoogleSpeaker(voice=selected_voice)
                    tetos_speakers_cache[cache_key] = speaker
                speaker.say(text, temp_filename)

            await asyncio.to_thread(run_tetos_sync)
            
            async def generate_from_file():
                try:
                    if os.path.exists(temp_filename):
                        data = open(temp_filename, "rb").read()
                        if target_format == "opus":
                            res = await asyncio.to_thread(convert_to_opus_simple, data)
                            data = res[0] if isinstance(res, tuple) else res
                        for i in range(0, len(data), 4096): yield data[i:i + 4096]
                finally:
                    if os.path.exists(temp_filename): os.remove(temp_filename)

            media_type = "audio/ogg" if target_format == "opus" else "audio/mpeg"
            return StreamingResponse(generate_from_file(), media_type=media_type)

        # ==========================================
        # 8. ElevenLabs TTS (最终修复版)
        # ==========================================
        elif tts_engine == 'elevenlabs':
            from elevenlabs.client import ElevenLabs as ElevenLabsClient
            
            api_key = tts_settings.get('elevenLabsApiKey', '')
            voice_id = tts_settings.get('elevenLabsVoice', '')
            model_id = tts_settings.get('elevenLabsModel', 'eleven_multilingual_v2')
            rate = float(tts_settings.get('elevenLabsRate', 1.0))
            
            if not api_key:
                raise HTTPException(status_code=400, detail="ElevenLabs API Key 未配置")
            if not voice_id:
                raise HTTPException(status_code=400, detail="ElevenLabs Voice ID 未配置")
            
            if mobile_optimized:
                rate = min(rate * 0.95, 1.2)
            
            client = ElevenLabsClient(api_key=api_key)
            
            # 1. 【修复关键点】提前建立连接和请求！如果 Voice ID 错误，这里会立即抛出异常
            # 此时因为还没有进入 StreamingResponse，抛出 HTTPException 状态码修改是完全合法的
            try:
                audio_stream = await asyncio.to_thread(
                    client.text_to_speech.convert,
                    text=text,
                    voice_id=voice_id,
                    model_id=model_id or 'eleven_multilingual_v2',
                    output_format='mp3_44100_128'
                )
            except Exception as e:
                error_msg = str(e)
                if "API key" in error_msg.lower() or "authentication" in error_msg.lower():
                    raise HTTPException(status_code=401, detail="ElevenLabs API Key 无效")
                elif "voice" in error_msg.lower() or "not found" in error_msg.lower():
                    raise HTTPException(status_code=400, detail=f"Voice ID 无效: {voice_id}")
                elif "model" in error_msg.lower():
                    raise HTTPException(status_code=400, detail=f"Model ID 无效: {model_id}")
                elif "credit" in error_msg.lower() or "quota" in error_msg.lower() or "characters" in error_msg.lower():
                    raise HTTPException(status_code=429, detail="ElevenLabs 额度不足")
                else:
                    raise HTTPException(status_code=502, detail=f"ElevenLabs 服务错误: {error_msg}")

            async def generate_audio():
                # 2. 【性能修复】利用线程池安全地拉取同步生成器的数据，避免阻塞并发循环
                def get_next_chunk():
                    try:
                        return next(audio_stream)
                    except StopIteration:
                        return None

                while True:
                    try:
                        chunk = await asyncio.to_thread(get_next_chunk)
                        if chunk is None:
                            break
                        if chunk:
                            yield chunk
                    except Exception as e:
                        # 注意：在这里如果流传输中断了，不能再 raise HTTPException 了，只需中断流即可
                        print(f"ElevenLabs 传输中断: {str(e)}")
                        break

            # 移动端：转换为 opus（需要先收集所有 chunk）
            if target_format == "opus":
                async def generate_opus():
                    collected = bytearray()
                    async for chunk in generate_audio():
                        collected.extend(chunk)
                    if collected:
                        res = await asyncio.to_thread(convert_to_opus_simple, bytes(collected))
                        final = res[0] if isinstance(res, tuple) else res
                        for i in range(0, len(final), 4096):
                            yield final[i:i + 4096]
                return StreamingResponse(
                    generate_opus(),
                    media_type="audio/ogg",
                    headers={
                        "Content-Disposition": f"inline; filename=tts_{index}.opus",
                        "X-Audio-Index": str(index),
                        "X-Audio-Format": "opus"
                    }
                )
            else:
                # MP3 直接流式返回 generator
                return StreamingResponse(
                    generate_audio(),
                    media_type="audio/mpeg",
                    headers={
                        "Content-Disposition": f"inline; filename=tts_{index}.mp3",
                        "X-Audio-Index": str(index),
                        "X-Audio-Format": "mp3"
                    }
                )
            
        # ==========================================
        # 9. MOSS TTS (纯本地 CPU 引擎，懒加载)
        # ==========================================
        elif tts_engine == 'moss':
            from py.moss_tts import moss_generate_audio
            
            # 读取 MOSS 参数设定
            moss_voice = tts_settings.get('mossVoice', 'Junhao')
            moss_speed = float(tts_settings.get('mossSpeed', 1.0))
            
            # 移动端语速安全降速
            if mobile_optimized:
                moss_speed = min(moss_speed * 0.95, 1.2)
            
            # 处理音色克隆
            # MOSS 复用已有的 gsvRefAudioPath 选择文件
            clone_audio_path = tts_settings.get('gsvRefAudioPath', '')
            abs_clone_path = ""
            if clone_audio_path:
                abs_clone_path = os.path.join(UPLOAD_FILES_DIR, clone_audio_path)
                if not os.path.exists(abs_clone_path):
                    abs_clone_path = clone_audio_path # 退避策略，万一传的是绝对路径
                    
            async def generate_moss_audio():
                try:
                    # 获取生成完的 WAV 字节流
                    wav_data = await moss_generate_audio(
                        text=text,
                        voice=moss_voice,
                        speed=moss_speed,
                        prompt_audio_path=abs_clone_path
                    )
                    
                    final_data = wav_data
                    # 如果移动端要求 OPUS，调用你已经写好的 converter
                    if target_format == "opus":
                        res = await asyncio.to_thread(convert_to_opus_simple, wav_data)
                        final_data = res[0] if isinstance(res, tuple) else res
                    
                    # 切片流式传输
                    chunk_size = 4096
                    for i in range(0, len(final_data), chunk_size):
                        yield final_data[i:i + chunk_size]
                        
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"MOSS TTS 生成错误: {e}")
                    raise HTTPException(status_code=500, detail=f"MOSS TTS 错误: {str(e)}")

            # 根据返回格式决定响应头
            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.wav"
            return StreamingResponse(
                generate_moss_audio(), 
                media_type=media_type, 
                headers={
                    "Content-Disposition": f"inline; filename={filename}", 
                    "X-Audio-Index": str(index),
                    "X-Audio-Format": target_format
                }
            )

        raise HTTPException(status_code=400, detail="不支持的TTS引擎")
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"服务器内部错误: {str(e)}"})

@app.post("/tts/tetos/list_voices")
async def list_tetos_voices(request: Request):
    """
    通过 tetos 获取音色列表
    流程: 接收配置 -> 实例化 Speaker -> 调用 .list_voices()
    """
    try:
        data = await request.json()
        provider = data.get('provider', '').lower()
        config = data.get('config', {})  # 用户填写的鉴权信息

        if not provider:
            return JSONResponse(status_code=400, content={"error": "缺少 'provider' 参数"})

        # 定义同步执行函数（在线程池运行，避免阻塞）
        def _sync_fetch_voices():
            voices = []

            # ---------------------------
            # Azure TTS
            # ---------------------------
            if provider == 'azure':
                from tetos.azure import AzureSpeaker
                # 实例化
                speaker = AzureSpeaker(
                    speech_key=config.get('speech_key') or config.get('api_key'),
                    speech_region=config.get('speech_region') or config.get('region')
                )
                # 获取列表
                voices = speaker.list_voices()

            # ---------------------------
            # Baidu TTS
            # ---------------------------
            elif provider == 'baidu':
                from tetos.baidu import BaiduSpeaker
                speaker = BaiduSpeaker(
                    api_key=config.get('api_key'),
                    secret_key=config.get('secret_key')
                )
                voices = speaker.list_voices()

            # ---------------------------
            # Minimax TTS
            # ---------------------------
            elif provider == 'minimax':
                from tetos.minimax import MinimaxSpeaker
                speaker = MinimaxSpeaker(
                    api_key=config.get('api_key'),
                    group_id=config.get('group_id')
                )
                voices = speaker.list_voices()

            # ---------------------------
            # 讯飞 (Xunfei)
            # ---------------------------
            elif provider == 'xunfei':
                from tetos.xunfei import XunfeiSpeaker
                speaker = XunfeiSpeaker(
                    app_id=config.get('app_id'),
                    api_key=config.get('api_key'),
                    api_secret=config.get('api_secret')
                )
                voices = speaker.list_voices()

            elif provider == 'fish':
                api_key = config.get('api_key')
                if not api_key:
                    raise ValueError("Fish Audio 需要配置 API Key")

                # 请求 Fish Audio 官方 API
                # page_size 设置为 30 以获取更多热门音色
                url = "https://api.fish.audio/model?page_size=30&page_number=1&sort_by=score"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Mozilla/5.0" 
                }
                
                response = requests.get(url, headers=headers, timeout=60)
                response.raise_for_status() # 检查 HTTP 错误
                res_json = response.json()
                
                # 解析返回的数据结构
                items = res_json.get("items", [])
                
                for item in items:
                    # 将 Fish Audio 的数据结构转换为前端通用的结构
                    # 前端 getVoiceValue 优先找 id
                    # 前端 getVoiceLabel 优先找 DisplayName 或 name
                    # 前端 getVoiceDesc 优先找 Locale
                    voices.append({
                        "id": item.get("_id"),            # 关键：这是实际的 voice ID
                        "name": item.get("title"),        # 显示名称
                        "DisplayName": item.get("title"), # 兼容字段
                        "Locale": item.get("languages", ["Unknown"])[0] if item.get("languages") else "" # 语言标签
                    })


            # ---------------------------
            # Google TTS
            # ---------------------------
            elif provider == 'google':
                from tetos.google import GoogleSpeaker
                # Google 特殊处理：tetos 依赖 GOOGLE_APPLICATION_CREDENTIALS 环境变量
                # 如果 config 传了 service_account 的 json 对象，我们需要临时写入文件
                
                service_account_data = config.get('service_account')
                temp_path = None
                
                try:
                    if service_account_data:
                        # 创建临时文件
                        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as tmp:
                            if isinstance(service_account_data, dict):
                                json.dump(service_account_data, tmp)
                            else:
                                tmp.write(str(service_account_data))
                            temp_path = tmp.name
                        
                        # 设置环境变量
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
                    
                    # GoogleSpeaker 初始化通常不需要参数，它自己去读环境变量
                    speaker = GoogleSpeaker()
                    voices = speaker.list_voices()
                    
                finally:
                    # 清理工作
                    if temp_path:
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        # 如果是我们设置的环境变量，用完删除，以免影响其他请求
                        if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") == temp_path:
                            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

            else:
                pass

            return voices

        # 使用 asyncio.to_thread 放入线程池执行，防止阻塞 FastAPI 主循环
        voice_list = await asyncio.to_thread(_sync_fetch_voices)

        return JSONResponse(content={
            "status": "success",
            "provider": provider,
            "data": voice_list
        })

    except Exception as e:
        print(f"获取 {provider} 音色列表失败: {e}")
        # 捕获鉴权失败、网络错误等
        return JSONResponse(status_code=500, content={
            "status": "error", 
            "message": str(e),
            "detail": f"获取 {provider} 音色列表失败，请检查密钥配置是否正确。"
        })

@app.get("/system/voices")
async def get_system_voices():
    """
    获取系统可用的 pyttsx3 音色列表。
    优化版：
    1. 优先展示 Siri/Premium 高质量音色
    2. 自动从 ID 中补全缺失的语言标识
    3. 为高质量音色添加 [Siri] 前缀
    """
    import pyttsx3
    import sys
    import re

    def fetch_voices_sync():
        try:
            # 1. 仍然保留怪诞音色黑名单 (这些声音确实没法用)
            mac_novelty_voices = {
                'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
                'Deranged', 'Good News', 'Hysterical', 'Pipe Organ', 'Trinoids', 
                'Whisper', 'Zarvox', 'Organ'
            }

            engine = pyttsx3.init()
            voices = engine.getProperty('voices')
            
            processed_voices = []

            for v in voices:
                voice_name = v.name
                voice_id = str(v.id) # 确保是字符串
                lower_id = voice_id.lower()

                # --- 过滤逻辑 ---
                if sys.platform == 'darwin':
                    if voice_name in mac_novelty_voices:
                        continue
                    
                    # 【重要修改】不要再过滤 'siri' 了！
                    # 我们只过滤那些完全无法使用的（通常 id 极其简短或是无效引用）
                    # 但保留包含 'siri', 'premium', 'compact' 的 ID

                # --- 语言解析逻辑 (增强版) ---
                lang = "Unknown"
                
                # 优先尝试从 pyttsx3 属性获取
                if hasattr(v, 'languages') and v.languages:
                    raw_lang = v.languages[0] if isinstance(v.languages, list) else v.languages
                    if isinstance(raw_lang, bytes):
                        try:
                            lang = raw_lang.decode('utf-8', errors='ignore').replace('\x05', '')
                        except:
                            lang = str(raw_lang)
                    else:
                        lang = str(raw_lang)

                # 【补全逻辑】如果属性里读不到语言，尝试从 ID 里正则提取
                # macOS 的 ID 通常长这样: com.apple.speech.synthesis.voice.zh_CN.ting-ting.premium
                if lang == "Unknown" or lang == "":
                    # 匹配 .zh_CN. 或 .en_US. 这种模式
                    match = re.search(r'\.([a-z]{2}[_-][A-Z]{2})\.', voice_id)
                    if match:
                        lang = match.group(1).replace('_', '-') # 统一格式为 zh-CN

                # --- 判断是否为 Siri/高质量音色 ---
                # 关键词：siri, premium (高品质), compact (压缩的高品质，通常是系统默认下载的)
                is_high_quality = False
                quality_tag = ""
                
                if any(k in lower_id for k in ['siri', 'premium', 'compact']):
                    is_high_quality = True
                    quality_tag = "[Siri/Premium] "
                
                # 有些系统直接在名字里就叫 "Siri Voice 1"
                if "siri" in voice_name.lower():
                    is_high_quality = True
                    quality_tag = "[Siri] "

                # 组装数据
                processed_voices.append({
                    "id": voice_id,
                    "name": f"{quality_tag}{voice_name}", # 在名字前加上标识，方便前端展示
                    "original_name": voice_name,
                    "lang": lang,
                    "gender": getattr(v, 'gender', 'Unknown'),
                    "is_siri": is_high_quality # 用于排序的标记
                })

            # --- 排序逻辑 ---
            # Python 的 sort 是稳定的。
            # key 解释: (not x['is_siri']) -> True(1) 排后面, False(0) 排前面
            # 所以 is_siri=True 的会排在最前面
            processed_voices.sort(key=lambda x: (not x['is_siri'], x['lang'], x['name']))

            return processed_voices
            
        except ImportError:
            print("错误: 未找到 pyttsx3 驱动")
            return []
        except Exception as e:
            print(f"获取系统音色错误: {str(e)}")
            return []

    try:
        available_voices = await asyncio.to_thread(fetch_voices_sync)
        return {
            "count": len(available_voices),
            "voices": available_voices
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


# 添加状态存储
mcp_status = {}
@app.post("/create_mcp")
async def create_mcp_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    mcp_id = data.get("mcpId")
    
    if not mcp_id:
        raise HTTPException(status_code=400, detail="Missing mcpId")
    
    # 将任务添加到后台队列
    background_tasks.add_task(process_mcp, mcp_id)
    
    return {"success": True, "message": "MCP服务器初始化已开始"}

@app.get("/mcp_status/{mcp_id}")
async def get_mcp_status(mcp_id: str):
    global mcp_client_list, mcp_status
    status = mcp_status.get(mcp_id, "not_found")
    if status == "ready":
        # 保证 _tools 里都是可序列化的 dict / list / 基本类型
        tools = await mcp_client_list[mcp_id].get_openai_functions(disable_tools=[])
        tools = json.dumps(mcp_client_list[mcp_id]._tools_list)
        return {"mcp_id": mcp_id, "status": status, "tools": tools}
    return {"mcp_id": mcp_id, "status": status, "tools": []}

async def process_mcp(mcp_id: str):
    """
    初始化单个 MCP 服务器，带失败回调同步，无需 sleep。
    """
    global mcp_client_list, mcp_status

    # 1. 同步原语：事件 + 失败原因
    init_done = asyncio.Event()
    fail_reason: str | None = None

    async def on_failure(error_message: str):
        nonlocal fail_reason
        # 仅第一次生效
        if fail_reason is not None:
            return
        fail_reason = error_message
        mcp_status[mcp_id] = f"failed: {error_message}"

        # 容错：只有客户端已创建才标记 disabled
        if mcp_id in mcp_client_list:
            mcp_client_list[mcp_id].disabled = True
            await mcp_client_list[mcp_id].close()
            print(f"关闭MCP服务器: {mcp_id}")

        init_done.set()          # 唤醒主协程

    # 2. 开始初始化
    mcp_status[mcp_id] = "initializing"
    try:
        cur_settings = await load_settings()
        server_config = cur_settings["mcpServers"][mcp_id]

        mcp_client_list[mcp_id] = McpClient()
        init_task = asyncio.create_task(
            mcp_client_list[mcp_id].initialize(
                mcp_id,
                server_config,
                on_failure_callback=on_failure
            )
        )
        # 2.1 先等初始化本身（最多 6 秒）
        await asyncio.wait_for(init_task, timeout=6)

        # 2.2 再等看 on_failure 会不会被触发（最多 5 秒）
        try:
            await asyncio.wait_for(init_done.wait(), timeout=5)
        except asyncio.TimeoutError:
            # 5 秒内没收到失败回调，认为成功
            pass

        # 3. 最终状态判定
        if fail_reason:
            # 回调里已经关过 client，这里只需保证状态一致
            mcp_client_list[mcp_id].disabled = True
            return
        tool = []
        retry = 0 
        while tool == [] and retry < 10:
            try:
                tool = await mcp_client_list[mcp_id].get_openai_functions(disable_tools=[])
            except Exception as e:
                print(f"获取工具失败: {str(e)}")
            finally:
                retry += 1
                await asyncio.sleep(0.5)
        mcp_status[mcp_id] = "ready"
        mcp_client_list[mcp_id].disabled = False

    except Exception as e:
        # 任何异常（超时、崩溃）都走这里
        mcp_status[mcp_id] = f"failed: {str(e)}"
        mcp_client_list[mcp_id].disabled = True
        await mcp_client_list[mcp_id].close()

    finally:
        # 如果任务还活着，保险起见取消掉
        if "init_task" in locals() and not init_task.done():
            init_task.cancel()
            try:
                await init_task
            except asyncio.CancelledError:
                pass

@app.delete("/remove_mcp")
async def remove_mcp_server(request: Request):
    global settings, mcp_client_list
    try:
        data = await request.json()
        server_name = data.get("serverName", "")

        if not server_name:
            raise HTTPException(status_code=400, detail="No server names provided")

        # 移除指定的MCP服务器
        current_settings = await load_settings()
        if server_name in current_settings['mcpServers']:
            del current_settings['mcpServers'][server_name]
            await save_settings(current_settings)
            settings = current_settings

            # 从mcp_client_list中移除
            if server_name in mcp_client_list:
                mcp_client_list[server_name].disabled = True
                await mcp_client_list[server_name].close()
                del mcp_client_list[server_name]
                print(f"关闭MCP服务器: {server_name}")

            return JSONResponse({"success": True, "removed": server_name})
        else:
            raise HTTPException(status_code=404, detail="Server not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        logger.error(f"移除MCP服务器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/remove_memory")
async def remove_memory_endpoint(request: Request):
    data = await request.json()
    memory_id = data.get("memoryId")
    if memory_id:
        try:
            # 删除MEMORY_CACHE_DIR目录下的memory_id文件夹
            memory_dir = os.path.join(MEMORY_CACHE_DIR, memory_id)
            shutil.rmtree(memory_dir)
            return JSONResponse({"success": True, "message": "Memory removed"})
        except Exception as e:
            return JSONResponse({"success": False, "message": str(e)})
    else:
        return JSONResponse({"success": False, "message": "No memoryId provided"})

@app.delete("/remove_agent")
async def remove_agent_endpoint(request: Request):
    data = await request.json()
    agent_id = data.get("agentId")
    if agent_id:
        try:
            # 删除AGENT_CACHE_DIR目录下的agent_id文件夹
            agent_dir = os.path.join(AGENT_DIR, f"{agent_id}.json")
            shutil.rmtree(agent_dir)
            return JSONResponse({"success": True, "message": "Agent removed"})
        except Exception as e:
            return JSONResponse({"success": False, "message": str(e)})
    else:
        return JSONResponse({"success": False, "message": "No agentId provided"})

@app.post("/a2a")
async def initialize_a2a(request: Request):
    from python_a2a import A2AClient
    data = await request.json()
    try:
        client = A2AClient(data['url'])
        agent_card = client.agent_card.to_json()
        agent_card = json.loads(agent_card)
        return JSONResponse({
            **agent_card,
            "status": "ready",
            "enabled": True
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/start_HA")
async def start_HA(request: Request):
    data = await request.json()
    API_TOKEN = data['data']['api_key']
    ha_config = {
        "type": "sse",
        "url": data['data']['url'].rstrip('/') + "/mcp_server/sse",
        "headers": {"Authorization": f"Bearer {API_TOKEN}"}
    }

    global HA_client
    if HA_client is not None:
        # 已初始化过
        return JSONResponse({"status": "ready", "enabled": True})

    # 用来通知“连接失败”的事件
    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        HA_client = McpClient()
        await HA_client.initialize("HA", ha_config, on_failure_callback=on_failure)

        # 等一小段时间验证连接确实活了
        try:
            # 5 秒内如果事件被 set，说明连接失败
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            # 走到这里说明失败了
            raise RuntimeError(f"HA client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            # 2 秒无事发生，认为连接成功
            pass

        return JSONResponse({"status": "ready", "enabled": True})

    except Exception as e:
        HA_client = None
        return JSONResponse(status_code=500, content={"error": str(e)})
    
@app.get("/stop_HA")
async def stop_HA():
    global HA_client
    try:
        if HA_client is not None:
            await HA_client.close()
            HA_client = None
            print(f"HA client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        HA_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/start_ChromeMCP")
async def start_ChromeMCP(request: Request):
    data = await request.json()
    chromeMCPSettings = data.get('data', {})

    # 1. 确定包名
    if chromeMCPSettings.get('mcpName', 'browser-mcp') == 'browser-mcp':
        target_package = "@browsermcp/mcp@latest"
    else:
        target_package = "@playwright/mcp@latest"

    # 2. 准备基础变量
    command = ""
    args = []
    
    # 3. 准备环境变量 (这是解决权限问题的关键！)
    env = os.environ.copy()

    # ★关键设置 A: 指定 Playwright 浏览器下载位置到用户可写目录
    # 避免它尝试写入系统目录或请求 sudo 权限
    # 获取当前应用运行目录下的 'browsers' 文件夹
    browser_storage = os.path.join(os.getcwd(), "browsers")
    if not os.path.exists(browser_storage):
        os.makedirs(browser_storage, exist_ok=True)
    
    env["PLAYWRIGHT_BROWSERS_PATH"] = browser_storage
    
    # ★关键设置 B: 告诉 npx 不要问 "Do you want to install..."
    # 虽然 args 里加了 -y，但设置这个环境变量是双重保险
    env["npm_config_yes"] = "true"

    # 4. 命令探测逻辑
    system_npx = shutil.which("npx")

    if system_npx:
        # --- 方案 A: 系统原生 npx (Docker 或 本地开发) ---
        print(f"Using system npx: {system_npx}")
        command = system_npx
        # 加上 -y 自动确认安装包
        args = ["-y", target_package] 
    
    else:
        # --- 方案 B: Electron 内部环境 ---
        electron_node = os.environ.get("ELECTRON_NODE_EXEC")
        electron_npm = os.environ.get("ELECTRON_NPM_CLI")
        
        if electron_node and electron_npm:
            print(f"System npx not found. Falling back to Electron Node.")
            command = electron_node
            # 构造: electron node npm-cli.js exec --yes -- @package
            # --yes 是 npm exec 的参数，表示自动安装缺失的包
            args = [electron_npm, "exec", "--yes", "--", target_package]
            
            # 必须设置，否则 Electron 会弹窗
            env["ELECTRON_RUN_AS_NODE"] = "1"
        else:
            return JSONResponse(
                status_code=500, 
                content={"error": "Node.js runtime not found."}
            )

    # 5. 组装配置
    Chrome_config = {
        "command": command,
        "args": args,
        "env": env
    }

    # ... (后续连接逻辑保持不变) ...
    global ChromeMCP_client
    if ChromeMCP_client is not None:
        return JSONResponse({"status": "ready", "enabled": True})

    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        ChromeMCP_client = McpClient()
        await ChromeMCP_client.initialize(
            "ChromeMCP", 
            Chrome_config, 
            on_failure_callback=on_failure
        )
        
        # ... (等待连接逻辑) ...
        try:
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            raise RuntimeError(f"ChromeMCP client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            pass

        return JSONResponse({"status": "ready", "enabled": True})

    except Exception as e:
        ChromeMCP_client = None
        print(f"Start ChromeMCP Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# 停止接口保持不变
@app.get("/stop_ChromeMCP")
async def stop_ChromeMCP():
    global ChromeMCP_client
    try:
        if ChromeMCP_client is not None:
            await ChromeMCP_client.close()
            ChromeMCP_client = None
            print(f"ChromeMCP client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        ChromeMCP_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/start_sql")
async def start_sql(request: Request):
    data = await request.json()
    sql_args = []
    user = str(data['data'].get('user', '')).strip()
    password = str(data['data'].get('password', '')).strip()
    host = str(data['data'].get('host', '')).strip()
    port = str(data['data'].get('port', '')).strip()
    dbname = str(data['data'].get('dbname', '')).strip()
    dbpath = str(data['data'].get('dbpath', '')).strip()
    sql_url = ""
    if (data['data']['engine']=='sqlite'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"sqlite:///{dbpath}"
        print(sql_url)
    elif (data['data']['engine']=='mysql'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "pymysql",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='postgres'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "psycopg2-binary",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='mssql'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "pymssql",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"mssql+pymssql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='oracle'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "oracledb",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"oracle+oracledb://{user}:{password}@{host}:{port}/{dbname}"

    sql_config = {
        "type": "stdio",
        "command": "uvx",
        "args": sql_args,
        "env": {
            "DB_URL": sql_url.strip(),
        }
    }

    global sql_client
    if sql_client is not None:
        # 已初始化过
        return JSONResponse({"status": "ready", "enabled": True})

    # 用来通知“连接失败”的事件
    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        sql_client = McpClient()
        await sql_client.initialize("sqlMCP", sql_config, on_failure_callback=on_failure)

        # 等一小段时间验证连接确实活了
        try:
            # 5 秒内如果事件被 set，说明连接失败
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            # 走到这里说明失败了
            raise RuntimeError(f"sqlMCP client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            # 2 秒无事发生，认为连接成功
            pass

        return JSONResponse({"status": "ready", "enabled": True})
    except Exception as e:
        sql_client = None
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/stop_sql")
async def stop_sql():
    global sql_client
    try:
        if sql_client is not None:
            await sql_client.close()
            sql_client = None
            print(f"sqlMCP client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        sql_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# 在现有路由之后添加health路由
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/load_file")
async def load_file_endpoint(request: Request, files: List[UploadFile] = File(None)):
    fastapi_base_url = str(request.base_url)
    file_links = []
    textFiles = []
    imageFiles = []
    vedioFiles = []
    
    # 辅助函数：根据后缀名判断类型
    def get_file_type(ext):
        ext = ext.lower().lstrip('.')
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            return 'image'
        if ext in ALLOWED_VIDEO_EXTENSIONS:
            return 'video'
        return 'file'

    content_type = request.headers.get('Content-Type', '')
    try:
        if 'multipart/form-data' in content_type:
            for file in files:
                file_extension = os.path.splitext(file.filename)[1]
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
                
                with open(destination, "wb") as buffer:
                    content = await file.read()
                    buffer.write(content)
                
                # ✨ 修改点：根据后缀决定 type
                current_type = get_file_type(file_extension)
                
                file_link = {
                    "path": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                    "name": file.filename,
                    "type": current_type  # 返回给前端
                }
                file_links.append(file_link)
                
                # 兼容原有的分类列表
                file_meta = {"unique_filename": unique_filename, "original_filename": file.filename}
                ext_clean = file_extension[1:].lower()
                if ext_clean in ALLOWED_EXTENSIONS:
                    textFiles.append(file_meta)
                elif ext_clean in ALLOWED_IMAGE_EXTENSIONS:
                    imageFiles.append(file_meta)
                elif ext_clean in ALLOWED_VIDEO_EXTENSIONS:
                    vedioFiles.append(file_meta)

        elif 'application/json' in content_type:
            data = await request.json()
            for file_info in data.get("files", []):
                file_path = file_info.get("path")
                file_name = file_info.get("name", os.path.basename(file_path))
                file_extension = os.path.splitext(file_name)[1]
                
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
                
                with open(file_path, "rb") as src, open(destination, "wb") as dst:
                    dst.write(src.read())
                
                # ✨ 修改点：根据后缀决定 type
                current_type = get_file_type(file_extension)
                
                file_link = {
                    "path": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                    "name": file_name,
                    "type": current_type
                }
                file_links.append(file_link)
                
                file_meta = {"unique_filename": unique_filename, "original_filename": file_name}
                ext_clean = file_extension[1:].lower()
                if ext_clean in ALLOWED_EXTENSIONS:
                    textFiles.append(file_meta)
                elif ext_clean in ALLOWED_IMAGE_EXTENSIONS:
                    imageFiles.append(file_meta)
                elif ext_clean in ALLOWED_VIDEO_EXTENSIONS:
                    vedioFiles.append(file_meta)

        return JSONResponse(content={"success": True, "fileLinks": file_links, "textFiles": textFiles, "imageFiles": imageFiles, "vedioFiles": vedioFiles})
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/delete_file")
async def delete_file_endpoint(request: Request):
    data = await request.json()
    file_name = data.get("fileName")
    file_path = os.path.join(UPLOAD_FILES_DIR, file_name)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={"success": True})
        else:
            return JSONResponse(content={"success": False, "message": "File not found"})
    except Exception as e:
        return JSONResponse(content={"success": False, "message": str(e)})

class FileNames(BaseModel):
    fileNames: List[str]

@app.delete("/delete_files")
async def delete_files_endpoint(req: FileNames):
    success_files = []
    errors = []
    for name in req.fileNames:
        path = os.path.join(UPLOAD_FILES_DIR, name)
        try:
            if os.path.exists(path):
                os.remove(path)
                success_files.append(name)
            else:
                errors.append(f"{name} not found")
        except Exception as e:
            errors.append(f"{name}: {str(e)}")

    return JSONResponse(content={
        "success": len(success_files) > 0,   # 只要有成功就算成功
        "successFiles": success_files,
        "errors": errors
    })

ALLOWED_AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac']

@app.post("/upload_gsv_ref_audio")
async def upload_gsv_ref_audio(
    request: Request,
    file: UploadFile = File(...),
):
    fastapi_base_url = str(request.base_url)
    
    # 检查文件扩展名
    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ALLOWED_AUDIO_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"不支持的文件类型: {file_extension}"}
        )
    
    # 生成唯一文件名
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
    
    try:
        # 保存文件
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # 构建响应
        file_link = f"{fastapi_base_url}uploaded_files/{unique_filename}"
        
        return JSONResponse(content={
            "success": True,
            "message": "参考音频上传成功",
            "file": {
                "path": file_link,
                "name": file.filename,
                "unique_filename": unique_filename
            }
        })
    
    except Exception as e:
        logger.error(f"参考音频上传失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"文件保存失败: {str(e)}"}
        )

@app.delete("/delete_audio/{filename}")
async def delete_audio(filename: str):
    try:
        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        
        # 安全检查：确保文件名是UUID格式，防止路径遍历攻击
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={
                "success": True,
                "message": "音频文件已删除"
            })
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "文件不存在"}
            )
            
    except Exception as e:
        logger.error(f"删除音频失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"删除失败: {str(e)}"}
        )

# 允许的VRM文件扩展名
ALLOWED_VRM_EXTENSIONS = {'vrm'}

@app.post("/upload_vrm_model")
async def upload_vrm_model(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    fastapi_base_url = str(request.base_url)
    
    # 检查文件扩展名
    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ALLOWED_VRM_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"不支持的文件类型: {file_extension}，只支持.vrm文件"}
        )
    
    # 生成唯一文件名
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
    
    try:
        # 保存文件
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # 构建响应
        file_link = f"{fastapi_base_url}uploaded_files/{unique_filename}"
        
        return JSONResponse(content={
            "success": True,
            "message": "VRM模型上传成功",
            "file": {
                "path": file_link,
                "display_name": display_name,
                "original_name": file.filename,
                "unique_filename": unique_filename
            }
        })
    
    except Exception as e:
        logger.error(f"VRM模型上传失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"文件保存失败: {str(e)}"}
        )

@app.get("/get_default_vrm_models")
async def get_default_vrm_models(request: Request):
    try:
        fastapi_base_url = str(request.base_url)
        models = []
        
        # 确保目录存在
        if not os.path.exists(DEFAULT_VRM_DIR):
            os.makedirs(DEFAULT_VRM_DIR, exist_ok=True)
            return JSONResponse(content={
                "success": True,
                "models": []
            })
        
        # 扫描默认VRM目录中的所有.vrm文件
        vrm_files = glob.glob(os.path.join(DEFAULT_VRM_DIR, "*.vrm"))
        
        for vrm_file in vrm_files:
            file_name = os.path.basename(vrm_file)
            # 使用文件名（不含扩展名）作为显示名称
            display_name = os.path.splitext(file_name)[0]
            
            # 构建文件访问URL
            file_url = f"{fastapi_base_url}vrm/{file_name}"
            
            models.append({
                "id": os.path.splitext(file_name)[0].lower(),  # 使用文件名作为ID
                "name": display_name,
                "path": file_url,
                "type": "default"
            })
        
        # 按名称排序
        models.sort(key=lambda x: x['name'])
        return JSONResponse(content={
            "success": True,
            "models": models
        })
        
    except Exception as e:
        logger.error(f"获取默认VRM模型失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"获取默认模型失败: {str(e)}"}
        )

# 修改删除VRM模型的接口，添加安全检查
@app.delete("/delete_vrm_model/{filename}")
async def delete_vrm_model(filename: str):
    try:
        # 确保只能删除上传目录中的文件，不能删除默认模型
        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        
        # 安全检查：确保文件名是UUID格式，防止路径遍历攻击
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vrm$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )
        
        # 额外检查：确保文件路径在上传目录中，防止删除默认模型
        if not file_path.startswith(os.path.abspath(UPLOAD_FILES_DIR)):
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "Cannot delete default models"}
            )
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={
                "success": True,
                "message": "VRM模型文件已删除"
            })
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "文件不存在"}
            )
            
    except Exception as e:
        logger.error(f"删除VRM模型失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"删除失败: {str(e)}"}
        )

ALLOWED_VRMA_EXTENSIONS = {"vrma"}

animation_dir = os.path.join(DEFAULT_VRM_DIR, "animations")

def make_file_url(request: Request, file_path: str) -> str:
    """将本地文件路径转成对外可访问的 URL"""
    return str(request.base_url) + file_path.lstrip("/")


def scan_motion_files(directory: str, allowed_ext: set) -> List[dict]:
    """
    扫描指定目录下所有符合扩展名的文件，返回列表：
    [
      {
        "id": "文件名(不含扩展名)",
        "name": "文件名(不含扩展名)",
        "path": "对外可访问的完整 URL",
        "type": "default" | "user"
      }
    ]
    """
    files = []
    if not os.path.exists(directory):
        return files

    for f in os.listdir(directory):
        if f.lower().endswith(tuple(allowed_ext)):
            file_id = Path(f).stem
            file_path = os.path.join(directory, f)
            # 注意：这里统一返回相对路径，后面再组装成 URL
            files.append({
                "id": file_id,
                "name": file_id,
                "path": file_path,
                "type": "default" if directory == animation_dir else "user"
            })
    # 按文件名排序
    files.sort(key=lambda x: x["name"])
    return files

@app.get("/get_default_vrma_motions")
async def get_default_vrma_motions(request: Request):
    try:
        motions = scan_motion_files(animation_dir, ALLOWED_VRMA_EXTENSIONS)

        # 把磁盘路径转成 URL
        for m in motions:
            file_name = os.path.basename(m["path"])
            m["path"] = str(request.base_url) + f"vrm/animations/{file_name}"

        return {"success": True, "motions": motions}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"获取默认动作失败: {str(e)}"}
        )


@app.get("/get_user_vrma_motions")
async def get_user_vrma_motions(request: Request):
    try:
        motions = scan_motion_files(UPLOAD_FILES_DIR)

        # 把磁盘路径转成 URL
        for m in motions:
            file_name = os.path.basename(m["path"])
            m["path"] = str(request.base_url) + f"uploaded_files/{file_name}"

        return {"success": True, "motions": motions}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"获取用户动作失败: {str(e)}"}
        )


@app.post("/upload_vrma_motion")
async def upload_vrma_motion(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    # 检查扩展名
    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in ALLOWED_VRMA_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"不支持的文件类型: {file_extension}"}
        )

    # 生成唯一文件名
    unique_filename = f"{uuid.uuid4()}.vrma"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)

    try:
        # 保存文件
        os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 构建返回数据
        file_url = make_file_url(request, f"uploaded_files/{unique_filename}")

        return JSONResponse(content={
            "success": True,
            "message": "动作上传成功",
            "file": {
                "unique_filename": unique_filename,
                "display_name": display_name,
                "path": file_url
            }
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"保存文件失败: {str(e)}"}
        )


@app.delete("/delete_vrma_motion/{filename}")
async def delete_vrma_motion(filename: str):
    try:
        # 只允许删除 UPLOAD_FILES_DIR 中的文件
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vrma$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )

        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        abs_upload = os.path.abspath(UPLOAD_FILES_DIR)
        abs_file = os.path.abspath(file_path)

        if not abs_file.startswith(abs_upload):
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "禁止删除系统文件"}
            )

        if os.path.exists(file_path):
            os.remove(file_path)
            return {"success": True, "message": "动作文件已删除"}
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "文件不存在"}
            )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"删除失败: {str(e)}"}
        )

# -------------- GAUSS 场景相关 --------------
GAUSS_DIR     = os.path.join(DEFAULT_VRM_DIR, "scene")       # 默认场景目录
ALLOWED_GAUSS = {"ply", "spz", "splat", "ksplat", "sog"}     # spark 支持的扩展名

@app.post("/upload_gauss_scene")
async def upload_gauss_scene(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_GAUSS:
        return JSONResponse(status_code=400, content={
            "success": False,
            "message": f"不支持的文件类型: {ext}"
        })
    unique = f"{uuid.uuid4()}.{ext}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique)
    try:
        os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)
        with open(destination, "wb") as f:
            f.write(await file.read())
        url = str(request.base_url) + f"uploaded_files/{unique}"
        return JSONResponse(content={
            "success": True,
            "file": {
                "unique_filename": unique,
                "display_name": display_name,
                "path": url
            }
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/get_default_gauss_scenes")
async def get_default_gauss_scenes(request: Request):
    try:
        os.makedirs(GAUSS_DIR, exist_ok=True)
        scenes = []
        for f in os.listdir(GAUSS_DIR):
            ext = Path(f).suffix.lower().lstrip(".")
            if ext in ALLOWED_GAUSS:
                scenes.append({
                    "id":   Path(f).stem,
                    "name": Path(f).stem,
                    "path": str(request.base_url) + f"vrm/scene/{f}",
                    "type": "default"
                })
        scenes.sort(key=lambda x: x["name"])
        return {"success": True, "scenes": scenes}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/get_user_gauss_scenes")
async def get_user_gauss_scenes(request: Request):
    try:
        scenes = []
        for f in os.listdir(UPLOAD_FILES_DIR):
            ext = Path(f).suffix.lower().lstrip(".")
            if ext in ALLOWED_GAUSS:
                scenes.append({
                    "id":   Path(f).stem,
                    "name": Path(f).stem,
                    "path": str(request.base_url) + f"uploaded_files/{f}",
                    "type": "user"
                })
        scenes.sort(key=lambda x: x["name"])
        return {"success": True, "scenes": scenes}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.delete("/delete_gauss_scene/{filename}")
async def delete_gauss_scene(filename: str):
    if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(ply|spz|splat|ksplat|sog)$", filename):
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid filename"})
    file_path = os.path.join(UPLOAD_FILES_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"success": True, "message": "场景已删除"}
    return JSONResponse(status_code=404, content={"success": False, "message": "文件不存在"})


@app.get("/update_storage")
async def update_storage_endpoint(request: Request):
    settings = await load_settings()
    textFiles = [item for item in (settings.get("textFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    imageFiles = [item for item in (settings.get("imageFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    videoFiles = [item for item in (settings.get("videoFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    # 检查UPLOAD_FILES_DIR目录中的文件，根据ALLOWED_EXTENSIONS、ALLOWED_IMAGE_EXTENSIONS、ALLOWED_VIDEO_EXTENSIONS分类，如果不存在于textFiles、imageFiles、videoFiles中则添加进去
    # 三个列表的元素是字典，包含"unique_filename"和"original_filename"两个键
    
    for file in os.listdir(UPLOAD_FILES_DIR):
        file_path = os.path.join(UPLOAD_FILES_DIR, file)
        if os.path.isfile(file_path):
            file_extension = os.path.splitext(file)[1][1:]
            if file_extension in ALLOWED_EXTENSIONS:
                if file not in [item["unique_filename"] for item in textFiles]:
                    textFiles.append({"unique_filename": file, "original_filename": file})
            elif file_extension in ALLOWED_IMAGE_EXTENSIONS:
                if file not in [item["unique_filename"] for item in imageFiles]:
                    imageFiles.append({"unique_filename": file, "original_filename": file})
            elif file_extension in ALLOWED_VIDEO_EXTENSIONS:
                if file not in [item["unique_filename"] for item in videoFiles]:
                    videoFiles.append({"unique_filename": file, "original_filename": file})

    # 发给前端
    return JSONResponse(content={"textFiles": textFiles, "imageFiles": imageFiles, "videoFiles": videoFiles})

@app.get("/get_file_content")
async def get_file_content_endpoint(file_url: str):
    file_path = os.path.join(UPLOAD_FILES_DIR, file_url)
    content = await get_file_content(file_path)
    return JSONResponse(content={"content": content})

@app.post("/create_kb")
async def create_kb_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    kb_id = data.get("kbId")
    
    if not kb_id:
        raise HTTPException(status_code=400, detail="Missing kbId")
    
    # 将任务添加到后台队列
    background_tasks.add_task(process_kb, kb_id)
    
    return {"success": True, "message": "知识库处理已开始，请稍后查询状态"}

@app.delete("/remove_kb")
async def remove_kb_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    kb_id = data.get("kbId")

    if not kb_id:
        raise HTTPException(status_code=400, detail="Missing kbId")
    try:
        background_tasks.add_task(remove_kb, kb_id)
    except Exception as e:
        return {"success": False, "message": str(e)}
    return {"success": True, "message": "知识库已删除"}

# 删除知识库
async def remove_kb(kb_id):
    # 删除KB_DIR/kb_id目录
    kb_dir = os.path.join(KB_DIR, str(kb_id))
    if os.path.exists(kb_dir):
        shutil.rmtree(kb_dir)
    else:
        print(f"KB directory {kb_dir} does not exist.")
    return

# 添加状态存储
kb_status = {}
@app.get("/kb_status/{kb_id}")
async def get_kb_status(kb_id):
    status = kb_status.get(kb_id, "not_found")
    print (f"kb_status: {kb_id} - {status}")
    return {"kb_id": kb_id, "status": status}

# 修改 process_kb
async def process_kb(kb_id):
    kb_status[kb_id] = "processing"
    try:
        from py.know_base import process_knowledge_base
        await process_knowledge_base(kb_id)
        kb_status[kb_id] = "completed"
    except Exception as e:
        kb_status[kb_id] = f"failed: {str(e)}"

@app.post("/create_sticker_pack")
async def create_sticker_pack(
    request: Request,
    files: List[UploadFile] = File(..., description="表情文件列表"),
    pack_name: str = Form(..., description="表情包名称"),
    descriptions: List[str] = Form(..., description="表情描述列表")
):
    """
    创建新表情包
    - files: 上传的图片文件列表
    - pack_name: 表情包名称
    - descriptions: 每个表情的描述列表
    """
    fastapi_base_url = str(request.base_url)
    imageFiles = []
    stickers_data = []
    
    try:
        # 验证输入数据
        if not pack_name:
            raise HTTPException(status_code=400, detail="表情包名称不能为空")
        if len(files) == 0:
            raise HTTPException(status_code=400, detail="至少需要上传一个表情")
        if len(descriptions) != len(files):
            raise HTTPException(
                status_code=400, 
                detail=f"描述数量({len(descriptions)})与文件数量({len(files)})不匹配"
            )

        # 处理上传的表情文件
        for idx, file in enumerate(files):
            # 获取文件扩展名
            file_extension = os.path.splitext(file.filename)[1].lower()
            
            # 验证文件类型
            if file_extension not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"不支持的文件类型: {file_extension}"
                )
            
            # 生成唯一文件名
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)

            # 保存文件
            with open(destination, "wb") as buffer:
                content = await file.read()
                buffer.write(content)

            # 构建返回数据
            imageFiles.append({
                "unique_filename": unique_filename,
                "original_filename": file.filename,
            })
            
            # 获取对应的描述（处理可能的索引越界）
            description = descriptions[idx] if idx < len(descriptions) else ""

            # 构建表情数据
            stickers_data.append({
                "unique_filename": unique_filename,
                "original_filename": file.filename,
                "url": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                "description": description
            })

        # 创建表情包ID（可替换为数据库存储逻辑）
        sticker_pack_id = str(uuid.uuid4())
        
        return JSONResponse(content={
            "success": True,
            "id": sticker_pack_id,
            "name": pack_name,
            "stickers": stickers_data,
            "imageFiles": imageFiles,
            "cover": stickers_data[0]["url"] if stickers_data else None
        })
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"创建表情包时出错: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")

# ==========================================
# 机器人管理器延迟加载容器 (Lazy Container)
# ==========================================
class BotContainer:
    """管理所有机器人的单例，只有在第一次调用 get 方法时才会 import 对应的重型 SDK"""
    _qq = None
    _feishu = None
    _dingtalk = None
    _discord = None
    _slack = None
    _telegram = None
    _wecom = None
    _wechat = None


    @classmethod
    def get_qq(cls):
        if cls._qq is None:
            from py.qq_bot_manager import QQBotManager
            cls._qq = QQBotManager()
        return cls._qq

    @classmethod
    def get_feishu(cls):
        if cls._feishu is None:
            from py.feishu_bot_manager import FeishuBotManager
            cls._feishu = FeishuBotManager()
        return cls._feishu

    @classmethod
    def get_dingtalk(cls):
        if cls._dingtalk is None:
            from py.dingtalk_bot_manager import DingtalkBotManager
            cls._dingtalk = DingtalkBotManager()
        return cls._dingtalk

    @classmethod
    def get_discord(cls):
        if cls._discord is None:
            from py.discord_bot_manager import DiscordBotManager
            cls._discord = DiscordBotManager()
        return cls._discord

    @classmethod
    def get_slack(cls):
        if cls._slack is None:
            from py.slack_bot_manager import SlackBotManager
            cls._slack = SlackBotManager()
        return cls._slack

    @classmethod
    def get_telegram(cls):
        if cls._telegram is None:
            from py.telegram_bot_manager import TelegramBotManager
            cls._telegram = TelegramBotManager()
        return cls._telegram

    @classmethod
    def get_wecom(cls):
        if cls._wecom is None:
            from py.wecom_bot_manager import WeComBotManager
            cls._wecom = WeComBotManager()
        return cls._wecom

    @classmethod
    def get_wechat(cls):
        if cls._wechat is None:
            from py.wechat_bot_manager import WeChatBotManager
            cls._wechat = WeChatBotManager()
        return cls._wechat

# ==========================================
# 1. QQ 机器人全量路由
# ==========================================

@app.post("/start_qq_bot")
async def start_qq_bot(config_data: dict):
    try:
        from py.qq_bot_manager import QQBotConfig
        config = QQBotConfig(**config_data)
        BotContainer.get_qq().start_bot(config)
        return {"success": True, "message": "QQ机器人已成功启动", "environment": "thread-based"}
    except Exception as e:
        logger.error(f"启动QQ机器人失败: {e}")
        return JSONResponse(status_code=400, content={"success": False, "message": f"启动失败: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_qq_bot")
async def stop_qq_bot():
    try:
        if BotContainer._qq:
            BotContainer.get_qq().stop_bot()
        return {"success": True, "message": "QQ机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/qq_bot_status")
async def qq_bot_status():
    if BotContainer._qq is None:
        return {"is_running": False, "status": "stopped"}
    status = BotContainer.get_qq().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"启动失败: {status['startup_error']}"
    return status

@app.post("/reload_qq_bot")
async def reload_qq_bot(config_data: dict):
    try:
        from py.qq_bot_manager import QQBotConfig
        config = QQBotConfig(**config_data)
        manager = BotContainer.get_qq()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "QQ机器人已重新加载", "config_changed": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# WeChat 机器人全量路由
# ==========================================
@app.post("/start_wechat_bot")
async def start_wechat_bot(config_data: dict):
    try:
        from py.wechat_bot_manager import WeChatBotConfig
        config = WeChatBotConfig(**config_data)
        BotContainer.get_wechat().start_bot(config)
        return {"success": True, "message": "微信机器人已启动，请查看终端输出扫码登录", "environment": "thread-based"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": f"启动失败: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_wechat_bot")
async def stop_wechat_bot():
    try:
        if BotContainer._wechat:
            BotContainer.get_wechat().stop_bot()
        return {"success": True, "message": "微信机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/wechat_bot_status")
async def wechat_bot_status():
    if BotContainer._wechat is None:
        return {"is_running": False}
    status = BotContainer.get_wechat().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"启动失败: {status['startup_error']}"
    return status

@app.post("/reload_wechat_bot")
async def reload_wechat_bot(config_data: dict):
    try:
        from py.wechat_bot_manager import WeChatBotConfig
        config = WeChatBotConfig(**config_data)
        manager = BotContainer.get_wechat()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "微信机器人已重新加载"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


# ==========================================
# 2. 飞书 机器人全量路由
# ==========================================

@app.post("/start_feishu_bot")
async def start_feishu_bot(config_data: dict):
    try:
        from py.feishu_bot_manager import FeishuBotConfig
        config = FeishuBotConfig(**config_data)
        BotContainer.get_feishu().start_bot(config)
        return {"success": True, "message": "飞书机器人已成功启动", "environment": "thread-based"}
    except Exception as e:
        logger.error(f"启动飞书机器人失败: {e}")
        return JSONResponse(status_code=400, content={"success": False, "message": f"启动失败: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_feishu_bot")
async def stop_feishu_bot():
    try:
        if BotContainer._feishu:
            BotContainer.get_feishu().stop_bot()
        return {"success": True, "message": "飞书机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/feishu_bot_status")
async def feishu_bot_status():
    if BotContainer._feishu is None:
        return {"is_running": False}
    status = BotContainer.get_feishu().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"启动失败: {status['startup_error']}"
    return status

@app.post("/reload_feishu_bot")
async def reload_feishu_bot(config_data: dict):
    try:
        from py.feishu_bot_manager import FeishuBotConfig
        config = FeishuBotConfig(**config_data)
        manager = BotContainer.get_feishu()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "飞书机器人已重新加载", "config_changed": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# 3. 钉钉 机器人全量路由
# ==========================================

@app.post("/start_dingtalk_bot")
async def start_dingtalk_bot(config_data: dict):
    try:
        from py.dingtalk_bot_manager import DingtalkBotConfig
        config = DingtalkBotConfig(**config_data)
        BotContainer.get_dingtalk().start_bot(config)
        return {"success": True, "message": "钉钉机器人已成功启动"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/stop_dingtalk_bot")
async def stop_dingtalk_bot():
    try:
        if BotContainer._dingtalk:
            BotContainer.get_dingtalk().stop_bot()
        return {"success": True, "message": "钉钉机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/dingtalk_bot_status")
async def dingtalk_bot_status():
    if BotContainer._dingtalk is None:
        return {"is_running": False}
    return BotContainer.get_dingtalk().get_status()

@app.post("/reload_dingtalk_bot")
async def reload_dingtalk_bot(config_data: dict):
    try:
        from py.dingtalk_bot_manager import DingtalkBotConfig
        config = DingtalkBotConfig(**config_data)
        manager = BotContainer.get_dingtalk()
        manager.stop_bot()
        import time as sync_time # 这里的 time 是为了配合你原代码中的 time.sleep
        sync_time.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "钉钉机器人配置已重载"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

# ==========================================
# 4. Discord 机器人全量路由
# ==========================================

@app.post("/start_discord_bot")
async def start_discord_bot(config_data: dict):
    try:
        from py.discord_bot_manager import DiscordBotConfig
        config = DiscordBotConfig(**config_data)
        BotContainer.get_discord().start_bot(config)
        return {"success": True, "message": "Discord 机器人已启动"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/stop_discord_bot")
async def stop_discord_bot():
    if BotContainer._discord:
        BotContainer.get_discord().stop_bot()
    return {"success": True, "message": "Discord 机器人已停止"}

@app.get("/discord_bot_status")
async def discord_bot_status():
    if BotContainer._discord is None:
        return {"is_running": False}
    return BotContainer.get_discord().get_status()

@app.post("/reload_discord_bot")
async def reload_discord_bot(config_data: dict):
    try:
        from py.discord_bot_manager import DiscordBotConfig
        config = DiscordBotConfig(**config_data)
        manager = BotContainer.get_discord()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Discord 机器人已重载"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# 5. Slack 机器人全量路由
# ==========================================

@app.post("/start_slack_bot")
async def start_slack_bot(config_data: dict):
    try:
        from py.slack_bot_manager import SlackBotConfig
        config = SlackBotConfig(**config_data)
        BotContainer.get_slack().start_bot(config)
        return {"success": True, "message": "Slack 机器人已启动"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/stop_slack_bot")
async def stop_slack_bot():
    if BotContainer._slack:
        BotContainer.get_slack().stop_bot()
    return {"success": True, "message": "Slack 机器人已停止"}

@app.get("/slack_bot_status")
async def slack_bot_status():
    if BotContainer._slack is None:
        return {"is_running": False}
    return BotContainer.get_slack().get_status()

@app.post("/reload_slack_bot")
async def reload_slack_bot(config_data: dict):
    try:
        from py.slack_bot_manager import SlackBotConfig
        config = SlackBotConfig(**config_data)
        manager = BotContainer.get_slack()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Slack 机器人已重载"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# 6. Telegram 机器人全量路由
# ==========================================

@app.post("/start_telegram_bot")
async def start_telegram_bot(config_data: dict):
    try:
        from py.telegram_bot_manager import TelegramBotConfig
        config = TelegramBotConfig(**config_data)
        BotContainer.get_telegram().start_bot(config)
        return {"success": True, "message": "Telegram 机器人已成功启动", "environment": "thread-based"}
    except Exception as e:
        logger.error(f"启动 Telegram 机器人失败: {e}")
        return JSONResponse(status_code=400, content={"success": False, "message": f"启动失败: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_telegram_bot")
async def stop_telegram_bot():
    try:
        if BotContainer._telegram:
            BotContainer.get_telegram().stop_bot()
        return {"success": True, "message": "Telegram 机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/telegram_bot_status")
async def telegram_bot_status():
    if BotContainer._telegram is None:
        return {"is_running": False}
    status = BotContainer.get_telegram().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"启动失败: {status['startup_error']}"
    return status

@app.post("/reload_telegram_bot")
async def reload_telegram_bot(config_data: dict):
    try:
        from py.telegram_bot_manager import TelegramBotConfig
        config = TelegramBotConfig(**config_data)
        manager = BotContainer.get_telegram()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Telegram 机器人已重新加载", "config_changed": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


# ==========================================
# 3. 企业微信 机器人全量路由
# ==========================================

@app.post("/start_wecom_bot")
async def start_wecom_bot(config_data: dict):
    try:
        from py.wecom_bot_manager import WeComBotConfig
        config = WeComBotConfig(**config_data)
        BotContainer.get_wecom().start_bot(config)
        return {"success": True, "message": "企业微信机器人已成功启动", "environment": "thread-based"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": f"启动失败: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_wecom_bot")
async def stop_wecom_bot():
    try:
        if hasattr(BotContainer, '_wecom') and BotContainer._wecom:
            BotContainer.get_wecom().stop_bot()
        return {"success": True, "message": "企业微信机器人已停止"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/wecom_bot_status")
async def wecom_bot_status():
    if not hasattr(BotContainer, '_wecom') or BotContainer._wecom is None:
        return {"is_running": False}
    status = BotContainer.get_wecom().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"启动失败: {status['startup_error']}"
    return status

@app.post("/reload_wecom_bot")
async def reload_wecom_bot(config_data: dict):
    try:
        from py.wecom_bot_manager import WeComBotConfig
        config = WeComBotConfig(**config_data)
        manager = BotContainer.get_wecom()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "企业微信机器人已重新加载", "config_changed": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})



@app.post("/add_workflow")
async def add_workflow(file: UploadFile = File(...), workflow_data: str = Form(...)):
    # 检查文件类型是否为 JSON
    if file.content_type != "application/json":
        raise HTTPException(
            status_code=400,
            detail="Only JSON files are allowed."
        )

    # 生成唯一文件名，uuid.uuid4()，没有连词符
    unique_filename = str(uuid.uuid4()).replace('-', '')

    # 拼接文件路径
    file_path = os.path.join(UPLOAD_FILES_DIR, unique_filename + ".json")

    # 保存文件
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

    # 解析 workflow_data
    workflow_data_dict = json.loads(workflow_data)

    # 返回文件信息
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "unique_filename": unique_filename,
                "original_filename": file.filename,
                "url": f"/uploaded_files/{unique_filename}",
                "enabled": True,
                "text_input": workflow_data_dict.get("textInput"),
                "text_input_2": workflow_data_dict.get("textInput2"),
                "image_input": workflow_data_dict.get("imageInput"),
                "image_input_2": workflow_data_dict.get("imageInput2"),
                "seed_input": workflow_data_dict.get("seedInput"),
                "seed_input2": workflow_data_dict.get("seedInput2"),
                "description": workflow_data_dict.get("description")
            }
        }
    )

@app.delete("/delete_workflow/{filename}")
async def delete_workflow(filename: str):
    file_path = os.path.join(UPLOAD_FILES_DIR, filename + ".json")
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # 删除文件
    try:
        os.remove(file_path)
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "File deleted successfully"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )

@app.get("/cur_language")
async def cur_language():
    settings = await load_settings()
    target_language = settings["currentLanguage"]
    return {"language": target_language}

@app.get("/vrm_config")
async def vrm_config():
    settings = await load_settings()
    return {"VRMConfig": settings.get("VRMConfig", {})}

@app.get("/tha_config")
async def tha_config():
    settings = await load_settings()
    return {"THAConfig": settings.get("THAConfig", {})}


@app.post("/tha_config")
async def set_tha_config(request: Request):
    """从THA页面前端更新模型选择"""
    try:
        payload = await request.json()
        settings = await load_settings()
        tha = settings.get("THAConfig", {})
        if "selectedModelId" in payload:
            tha["selectedModelId"] = payload["selectedModelId"]
            settings["THAConfig"] = tha
            await save_settings(settings)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


@app.post("/tha_emotion")
async def tha_emotion(request: Request):
    """向所有已连接的 THA 挂件广播表情/动作（调试与外部集成用）。

    支持三种格式：
      {"emotion": "happy"}                          单表情
      {"expressions": ["happy:0.3", "surprised:0.5"]} 权重字符串列表
      {"emotions": {"happy": 0.3, "surprised": 0.5}}  权重字典
    """
    try:
        payload = await request.json()
        if "emotions" in payload:
            emotions = payload["emotions"]
            if not isinstance(emotions, dict) or not all(
                    isinstance(v, (int, float)) for v in emotions.values()):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "emotions 必须是 {表情名: 数值权重} 字典"})
            expressions = [f"{k}:{v}" for k, v in emotions.items()]
        elif "expressions" in payload:
            if not isinstance(payload["expressions"], list):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "expressions 必须是字符串列表"})
            expressions = payload["expressions"]
        elif "emotion" in payload:
            if not isinstance(payload["emotion"], str):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "emotion 必须是字符串"})
            expressions = [payload["emotion"]]
        else:
            return JSONResponse(status_code=400, content={
                "success": False, "message": "需要 emotion / expressions / emotions 之一"})
        await tts_manager.broadcast_expressions_to_tha(expressions)
        return {"success": True, "expressions": expressions}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


@app.post("/upload_tha_model")
async def upload_tha_model(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    from py.tha_engine import THAModelManager

    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ('onnx', 'zip'):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "只支持 .onnx 或 .zip (CoreML) 格式的THA模型文件"}
        )

    try:
        data = await file.read()
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        if file_extension == 'onnx':
            success, msg, info = manager.install_onnx(data, display_name)
        else:
            success, msg, info = manager.install_mlpackage(data, display_name)

        if success:
            return JSONResponse(content={
                "success": True,
                "message": msg,
                "model": info
            })
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": msg}
            )
    except Exception as e:
        logger.error(f"上传THA模型失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"上传失败: {str(e)}"}
        )


@app.get("/get_default_tha_models")
async def get_default_tha_models(request: Request):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        models = manager.scan_default_models()
        return JSONResponse(content={"success": True, "models": models})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"获取默认模型失败: {str(e)}"}
        )


@app.get("/get_user_tha_models")
async def get_user_tha_models(request: Request):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        models = manager.scan_user_models()
        return JSONResponse(content={"success": True, "models": models})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"获取用户模型失败: {str(e)}"}
        )


@app.delete("/delete_tha_model/{model_id}")
async def delete_tha_model(model_id: str):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        if manager.delete_model(model_id):
            return JSONResponse(content={"success": True, "message": "THA模型已删除"})
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "模型不存在或无法删除默认模型"}
            )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"删除失败: {str(e)}"}
        )


from py.live_router import router as live_router, ws_router as live_ws_router

# 2. 分别挂载
app.include_router(live_router)     # /api/live/*
app.include_router(live_ws_router)  # /ws/live/*


from py.overlay_router import router as overlay_router
app.include_router(overlay_router)

# ---------- 工具 ----------
def get_dir(mid: str) -> str:
    return os.path.join(MEMORY_CACHE_DIR, mid)

def get_faiss_path(mid: str) -> str:
    return os.path.join(get_dir(mid), "agent-party.faiss")

def get_pkl_path(mid: str) -> str:
    return os.path.join(get_dir(mid), "agent-party.pkl")

def load_index_and_meta(mid: str):
    import faiss
    fpath, ppath = get_faiss_path(mid), get_pkl_path(mid)
    if not (os.path.exists(fpath) and os.path.exists(ppath)):
        raise HTTPException(status_code=404, detail="memory not found")
    index = faiss.read_index(fpath)
    with open(ppath, "rb") as f:
        raw = pickle.load(f)          # 可能是 tuple 也可能是 dict
    # 兼容旧数据：如果是 tuple 取第 0 个，否则直接用
    meta_dict = raw[0] if isinstance(raw, tuple) else raw
    return index, meta_dict

def save_index_and_meta(mid: str, index, meta: List[Dict[Any, Any]]):
    import faiss
    faiss.write_index(index, get_faiss_path(mid))
    with open(get_pkl_path(mid), "wb") as f:
        pickle.dump(meta, f)


def fmt_iso8605_to_local(iso: str) -> str:
    """
    ISO-8601 -> 服务器本地时区 yyyy-MM-dd HH:mm:ss
    """
    try:
        dt = datetime.fromisoformat(iso)      # 读入（可能带时区）
        dt = dt.astimezone()                  # 落到服务器当前时区
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return iso        # 解析失败就原样返回


def flatten_records(meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    flat = []
    for uuid, rec in meta.items():
        flat.append({
            "idx"        : len(flat),
            "uuid"       : uuid,
            "text"       : rec["data"],
            "created_at" : fmt_iso8605_to_local(rec["created_at"]),
            "timetamp"   : rec["timetamp"],
        })
    return flat


# 新增： dict ↔ list 互转工具
def dict_to_list(meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    """有序化，保证顺序与 Faiss 索引一致"""
    return [{uuid: rec} for uuid, rec in meta.items()]

def list_to_dict(meta_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """列表再压回 dict"""
    new_meta = {}
    for item in meta_list:
        uuid, rec = next(iter(item.items()))
        new_meta[uuid] = rec
    return new_meta

# ---------- 模型 ----------
class TextUpdate(BaseModel):
    new_text: str

# ---------- 1. 读取（平铺） ----------
@app.get("/memory/{memory_id}")
async def read_memory(memory_id: str) -> List[Dict[str, Any]]:
    _, meta_dict = load_index_and_meta(memory_id)   # 拆包
    return flatten_records(meta_dict)               # 传字典

# ---------- 2. 修改（只改 data） ----------
@app.put("/memory/{memory_id}/{idx}")
async def update_text(
    memory_id: str,
    idx: int,
    body: TextUpdate = Body(...)
) -> dict:
    index, meta_dict = load_index_and_meta(memory_id)
    meta_list = dict_to_list(meta_dict)
    if not (0 <= idx < len(meta_list)):
        raise HTTPException(status_code=404, detail="index out of range")
    # 定位 → 改 data
    uuid, rec = next(iter(meta_list[idx].items()))
    rec["data"] = body.new_text
    # 写回
    save_index_and_meta(memory_id, index, list_to_dict(meta_list))
    return {"message": "updated", "idx": idx}


# ---------- 3. 删除（按行号） ----------
@app.delete("/memory/{memory_id}/{idx}")
async def delete_text(memory_id: str, idx: int) -> dict:
    import faiss
    import numpy as np
    index, meta_dict = load_index_and_meta(memory_id)
    meta_list = dict_to_list(meta_dict)
    if not (0 <= idx < len(meta_list)):
        raise HTTPException(status_code=404, detail="index out of range")

    ntotal = index.ntotal
    print("index.ntotal",index.ntotal)
    print("len(meta_list)",len(meta_list))
    if ntotal != len(meta_list):
        raise RuntimeError("index 与 meta 长度不一致")

    # 1. 重建 Faiss 索引（去掉 idx）
    ids_to_keep = np.array([i for i in range(ntotal) if i != idx], dtype=np.int64)
    vecs = np.vstack([index.reconstruct(i) for i in range(ntotal)])
    new_index = faiss.IndexFlatL2(index.d)   # 跟你建索引时保持一致
    if vecs.shape[0] - 1 > 0:
        new_index.add(vecs[ids_to_keep].astype("float32"))

    # 2. 删除列表元素
    del meta_list[idx]

    # 3. 落盘
    save_index_and_meta(memory_id, new_index, list_to_dict(meta_list))
    return {"message": "deleted", "idx": idx}

@app.post("/api/update_proxy") # 建议改用 POST 表达状态变更
async def update_proxy():
    try:
        from py.get_setting import load_settings  # 确保引用正确
        settings = await load_settings()
        
        if not settings:
            return {"message": "Settings not found", "success": False}

        sys_set = settings.get("systemSettings", {})
        mode = sys_set.get("proxyMode")
        manual_url = sys_set.get("proxy", "").strip()
        is_china_proxy = sys_set.get("isChinaProxy", False)

        # 所有的代理相关环境变量键
        proxy_keys = ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy']

        # --- 1. 处理 Node.js / UV 镜像源 (与 lifespan 一致) ---
        if is_china_proxy:
            os.environ["npm_config_registry"] = "https://registry.npmmirror.com/"
            os.environ["UV_INDEX_URL"] = "https://mirrors.aliyun.com/pypi/simple/"
        else:
            # 如果关闭了中国加速，移除这些变量（恢复默认）
            os.environ.pop("npm_config_registry", None)
            os.environ.pop("UV_INDEX_URL", None)

        # --- 2. 处理网络代理环境变量 ---
        if mode == "manual" and manual_url:
            # [防御] 如果是 socks，强制清理并警告，防止 httpx 崩溃
            if manual_url.lower().startswith("socks"):
                for key in proxy_keys:
                    os.environ.pop(key, None)
                return {"message": "Detected SOCKS proxy, disabled to prevent crash. Please use HTTP/HTTPS proxy.", "success": False}
            
            # 设置手动代理
            for key in proxy_keys:
                os.environ[key] = manual_url
                
        elif mode == "system":
            # 系统模式：移除 Python 显式设置的环境变量，让底层读取系统全局配置
            for key in proxy_keys:
                os.environ.pop(key, None)
        else:
            # 关闭代理模式：将变量设为空字符串或直接移除
            for key in proxy_keys:
                os.environ[key] = "" 

        # --- 3. [进阶] 尝试动态更新全局 global_http_client ---
        # 注意：修改 os.environ 只对后续创建的子进程有效。
        # 如果你想让当前运行中的 OpenAI 请求也立即切换代理，
        # 最好在这里重新初始化你的 global_http_client（参考下文建议）。

        return {
            "message": "Proxy and mirrors updated successfully", 
            "success": True, 
            "current_mode": mode,
            "china_mirror": is_china_proxy
        }
    except Exception as e:
        return {"message": str(e), "success": False}

@app.get("/api/get_userfile")
async def get_userfile():
    try:
        userfile = USER_DATA_DIR
        return {"message": "Userfile loaded successfully", "userfile": userfile, "success": True}
    except Exception as e:
        return {"message": str(e), "success": False}

@app.get("/api/get_extfile")
async def get_extfile():
    try:
        extfile = EXT_DIR
        return {"message": "Extfile loaded successfully", "extfile": extfile, "success": True}
    except Exception as e:
        return {"message": str(e), "success": False}

def get_internal_ip():
    """获取本机内网 IP 地址"""
    try:
        # 创建一个 socket 连接，目标可以是任何公网地址（不真连接），只是用来获取出口 IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))  # 使用 Google DNS，不实际发送数据
        internal_ip = s.getsockname()[0]
        s.close()
        return internal_ip
    except Exception:
        return "127.0.0.1"

@app.get("/api/ip")
def get_ip():
    ip = get_internal_ip()
    return {"ip": ip}


async def sync_all_bots_behavior(settings_dict: dict):
    """
    统一同步所有平台机器人的行为引擎配置。
    注意：此处必须统一使用 BotContainer 获取实例，确保与路由中操作的是同一个对象。
    """
    # 提取全局行为设置
    behavior_data = settings_dict.get("behaviorSettings", {})
    
    # 1. --- 同步飞书 (Feishu) ---
    try:
        # 检查 BotContainer 内部存储的静态变量是否已初始化
        if BotContainer._feishu is not None:
            mgr = BotContainer.get_feishu()
            # 只有在机器人正在运行时才同步配置
            if mgr.is_running:
                from py.feishu_bot_manager import FeishuBotConfig
                config_data = settings_dict.get("feishuBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                # 构建新的配置模型并更新
                new_config = FeishuBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: 飞书机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (Feishu): {e}")

    # --- 同步微信 (WeChat) ---
    try:
        if BotContainer._wechat is not None:
            mgr = BotContainer.get_wechat()
            if mgr.is_running:
                from py.wechat_bot_manager import WeChatBotConfig
                config_data = settings_dict.get("wechatBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = WeChatBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: 微信机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (WeChat): {e}")

    # 2. --- 同步钉钉 (DingTalk) ---
    try:
        if BotContainer._dingtalk is not None:
            mgr = BotContainer.get_dingtalk()
            if mgr.is_running:
                from py.dingtalk_bot_manager import DingtalkBotConfig
                config_data = settings_dict.get("dingtalkBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = DingtalkBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: 钉钉机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (DingTalk): {e}")

    # 3. --- 同步 Discord ---
    try:
        if BotContainer._discord is not None:
            mgr = BotContainer.get_discord()
            if mgr.is_running:
                from py.discord_bot_manager import DiscordBotConfig
                config_data = settings_dict.get("discordBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = DiscordBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: Discord 机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (Discord): {e}")

    # 4. --- 同步 Telegram ---
    try:
        if BotContainer._telegram is not None:
            mgr = BotContainer.get_telegram()
            if mgr.is_running:
                from py.telegram_bot_manager import TelegramBotConfig
                config_data = settings_dict.get("telegramBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = TelegramBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: Telegram 机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (Telegram): {e}")

    # 5. --- 同步 Slack ---
    try:
        if BotContainer._slack is not None:
            mgr = BotContainer.get_slack()
            if mgr.is_running:
                from py.slack_bot_manager import SlackBotConfig
                config_data = settings_dict.get("slackBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = SlackBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: Slack 机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (Slack): {e}")

    # 6. --- 同步 QQ ---
    try:
        if BotContainer._qq is not None:
            mgr = BotContainer.get_qq()
            if mgr.is_running:
                from py.qq_bot_manager import QQBotConfig
                config_data = settings_dict.get("qqBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                new_config = QQBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: QQ 机器人行为配置已同步")
    except Exception as e:
        print(f"WebSocket Sync Error (QQ): {e}")

    # 7. --- 同步企业微信 (WeCom) ---
    try:
        # 核心检查：BotContainer._wecom 是 /start_wecom_bot 路由存放实例的地方
        if BotContainer._wecom is not None:
            mgr = BotContainer.get_wecom()
            if mgr.is_running:
                from py.wecom_bot_manager import WeComBotConfig
                config_data = settings_dict.get("weComBotConfig", {})
                config_data["behaviorSettings"] = behavior_data
                # 校验并同步更新
                new_config = WeComBotConfig(**config_data)
                mgr.update_behavior_config(new_config)
                print("WebSocket Sync: 企微机器人行为配置已同步 (BotContainer 实例同步成功)")
            else:
                print("WebSocket Sync: 企微机器人已初始化但尚未启动 (is_running 为 False)")
    except Exception as e:
        print(f"WebSocket Sync Error (WeCom): {e}")

settings_lock = asyncio.Lock()
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. 建立连接
    await ws_manager.connect(websocket)
    print(f"[DEBUG] WebSocket连接建立成功")
    # [状态标记] 为当前连接生成唯一ID并初始化状态
    connection_id = str(shortuuid.ShortUUID().random(length=8))
    print(f"[DEBUG] 连接ID: {connection_id}")
    has_sent_prompt = False
    has_start_tts = False
    registered_ext_ids = set()
    try:
        # 2. 初始数据推送
        async with settings_lock:
            current_settings = await load_settings()
            # 兼容旧逻辑：将 conversations 移出 settings 独立存储
            if current_settings.get("conversations", None):
                await save_covs({
                    "conversations": current_settings["conversations"],
                    "conversationGroups": current_settings.get("conversationGroups", [])
                })
                del current_settings["conversations"]
                if current_settings.get("conversationGroups", None) is not None:
                    del current_settings["conversationGroups"]
                await save_settings(current_settings)
            
            covs = await load_covs()
            current_settings["conversations"] = covs.get("conversations", [])
            current_settings["conversationGroups"] = covs.get("conversationGroups", [])
        
        await ws_manager.send_json({"type": "settings", "data": current_settings}, websocket)
        
        # 3. 消息处理循环
        while True:
            try:
                data = await websocket.receive_json()
            except RuntimeError as e:
                # ✨ 核心修复：捕获“接收已断开连接的消息”错误
                if "receive" in str(e):
                    break # 退出循环
                raise e # 其他运行时错误继续抛出
            
            msg_type = data.get("type")
            
            if msg_type == "ping":
                await ws_manager.send_json({"type": "pong"}, websocket)

            elif msg_type == "save_settings":
                settings_dict = data.get("data", {})
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    sys_prompt = settings_dict.get("system_prompt", "")
                    if sys_prompt:
                        is_safe, matched = await check_content_safety(sys_prompt)
                        if not is_safe:
                            print(f"[content_safety] ws save_settings blocked words: {matched}")
                            await ws_manager.send_json({"type": "error", "message": "系统提示词包含敏感内容，设置未保存。"}, websocket)
                            break
                from py.get_setting import deep_update
                deep_update(cur_settings, settings_dict)
                await save_settings(cur_settings)
                await sync_all_bots_behavior(cur_settings)
                try:
                    from py.diary_engine import global_diary_engine
                    global_diary_engine.update_config(cur_settings.get("diarySettings"))
                except Exception as e:
                    print(f"日记引擎配置同步异常: {e}")

                await ws_manager.send_json({
                    "type": "settings_saved",
                    "correlationId": data.get("correlationId"),
                    "success": True
                }, websocket)
                
                # 广播给其他客户端（不含自己）
                await ws_manager.broadcast_settings_update(cur_settings, exclude=websocket)

            elif msg_type == "save_conversations":
                cov_data = data.get("data", {})
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    covs = cov_data.get("conversations", [])
                    for conv in covs:
                        for msg in conv.get("messages", []):
                            if msg.get("role") == "assistant":
                                content = msg.get("content", "")
                                if isinstance(content, str):
                                    is_safe, matched = await check_content_safety(content, min_cjk_chars=3)
                                    if not is_safe:
                                        print(f"[content_safety] ws save_conversations blocked words: {matched}")
                                        msg["content"] = "[该回复已被内容安全策略自动替换]"
                                        msg["_safety_filtered"] = True
                                elif isinstance(content, list):
                                    text = " ".join(item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text")
                                    is_safe, matched = await check_content_safety(text, min_cjk_chars=3)
                                    if not is_safe:
                                        print(f"[content_safety] ws save_conversations blocked words: {matched}")
                                        msg["content"] = "[该回复已被内容安全策略自动替换]"
                                        msg["_safety_filtered"] = True
                await save_covs(cov_data)
                await ws_manager.send_json({
                    "type": "conversations_saved",
                    "correlationId": data.get("correlationId"),
                    "success": True
                }, websocket)

            elif msg_type == "save_current_conversation":
                conv_id = data.get("conversationId")
                conv_data = data.get("conversation")
                if conv_id and conv_data:
                    try:
                        await save_single_cov(conv_id, conv_data)
                    except Exception as e:
                        print(f"[save_current_conversation] 保存失败: {e}")

            elif msg_type == "get_settings":
                settings = await load_settings()
                if settings.get("conversations", None):
                    await save_covs({
                        "conversations": settings["conversations"],
                        "conversationGroups": settings.get("conversationGroups", [])
                    })
                    del settings["conversations"]
                    if settings.get("conversationGroups", None) is not None:
                        del settings["conversationGroups"]
                    await save_settings(settings)
                covs = await load_covs()
                settings["conversations"] = covs.get("conversations", [])
                settings["conversationGroups"] = covs.get("conversationGroups", [])
                await ws_manager.send_json({"type": "settings", "data": settings}, websocket)

            elif msg_type == "save_agent":
                current_settings = await load_settings()
                agent_id = str(shortuuid.ShortUUID().random(length=8))
                config_path = os.path.join(AGENT_DIR, f"{agent_id}.json")
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(current_settings, f, indent=4, ensure_ascii=False)
                
                current_settings['agents'][agent_id] = {
                    "id": agent_id,
                    "name": data['data']['name'],
                    "system_prompt": data['data']['system_prompt'],
                    "config_path": config_path,
                    "enabled": False,
                }
                await save_settings(current_settings)
                await ws_manager.send_json({"type": "settings", "data": current_settings}, websocket)
            
            elif msg_type == "set_user_input":
                user_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "update_user_input",
                    "data": {"text": user_input}
                })

            elif msg_type == "set_system_prompt":
                has_sent_prompt = True # 标记该连接发送过 Prompt
                extension_system_prompt = data.get("data", {}).get("text", "")
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    is_safe, matched = await check_content_safety(extension_system_prompt)
                    if not is_safe:
                        print(f"[content_safety] ws set_system_prompt blocked words: {matched}")
                        await ws_manager.send_json({"type": "error", "message": "系统提示词包含敏感内容，已被安全策略拦截。"}, websocket)
                        break
                await ws_manager.broadcast({
                    "type": "update_system_prompt",
                    "data": {
                        "id": connection_id,
                        "text": extension_system_prompt
                    }
                })

            elif msg_type == "remove_system_prompt":
                # 主动移除该连接之前注入的 system prompt
                has_sent_prompt = False
                await ws_manager.broadcast({
                    "type": "remove_system_prompt",
                    "data": {"id": connection_id}
                })

            elif msg_type == "set_tool_input":
                tool_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "update_tool_input",
                    "data": {"text": tool_input}
                })

            elif msg_type == "start_read":
                has_start_tts = True
                read_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "start_tts",
                    "data": {"text": read_input}
                })

            elif msg_type == "stop_read":
                await ws_manager.broadcast({
                    "type": "stop_tts",
                    "data": {}
                })

            elif msg_type == "register_node_extension_mcp":
                ext_id = data.get("data", {}).get("ext_id")
                tools = data.get("data", {}).get("tools", [])
                
                if ext_id and tools:
                    node_ext_mcp_tools[ext_id] = tools
                    registered_ext_ids.add(ext_id)  # 🔥 记录
                    print(f"[MCP] Node扩展 {ext_id} 注册了 {len(tools)} 个工具")
                    
                    # 通知所有客户端更新工具列表
                    await ws_manager.broadcast({
                        "type": "node_ext_mcp_registered",
                        "data": {
                            "ext_id": ext_id,
                            "tools": tools
                        }
                    })
                    
                    # 可选：返回注册成功消息
                    await websocket.send_json({
                        "type": "mcp_registered",
                        "data": {"ext_id": ext_id, "status": "success"}
                    })

            elif msg_type == "unregister_node_extension_mcp":
                ext_id = data.get("data", {}).get("ext_id")
                if ext_id in node_ext_mcp_tools:
                    del node_ext_mcp_tools[ext_id]
                    registered_ext_ids.discard(ext_id)  # 🔥 移除记录
                    print(f"[MCP] Node扩展 {ext_id} 已主动注销")
                    
                    await ws_manager.broadcast({
                        "type": "node_ext_mcp_unregistered",
                        "data": {"ext_id": ext_id}
                    })

            elif msg_type == "mcp_tool_result":
                call_id = data.get("data", {}).get("call_id")
                result = data.get("data", {}).get("result")
                
                if call_id in mcp_call_results:
                    mcp_call_results[call_id].set_result(result)

            elif msg_type == "trigger_close_extension":
                await ws_manager.broadcast({"type": "trigger_close_extension", "data": {}})

            elif msg_type == "trigger_send_message":
                await ws_manager.broadcast({"type": "trigger_send_message", "data": {}})
                    
            elif msg_type == "trigger_clear_message":
                await ws_manager.broadcast({"type": "trigger_clear_message", "data": {}})

            elif msg_type == "get_messages":
                await ws_manager.broadcast({"type": "request_messages", "data": {}})

            elif msg_type == "broadcast_messages":
                messages_data = data.get("data", {})
                # 广播给除自己以外的所有人
                await ws_manager.broadcast({
                    "type": "messages_update",
                    "data": messages_data
                }, exclude=websocket)

    except Exception as e:
        print(f"WebSocket error for {connection_id}: {e}")
    finally:
        for ext_id in registered_ext_ids:
            if ext_id in node_ext_mcp_tools:
                del node_ext_mcp_tools[ext_id]
                print(f"[MCP] 连接断开，自动清理扩展 {ext_id}")
                
                await ws_manager.broadcast({
                    "type": "node_ext_mcp_unregistered",
                    "data": {"ext_id": ext_id}
                })

        # 4. 断开连接并清理
        ws_manager.disconnect(websocket)
        
        if has_sent_prompt:
            print(f"Extension {connection_id} disconnected. Removing prompt.")
            await ws_manager.broadcast({
                "type": "remove_system_prompt",
                "data": {"id": connection_id}
            })
            
        if has_start_tts:
            print(f"Extension {connection_id} disconnected. Stopping tts.")
            await ws_manager.broadcast({
                "type": "stop_tts",
                "data": {}
            })

@app.post("/sys/shutdown")
async def shutdown_server():
    """
    接收到此请求后，向自己发送 SIGTERM 信号，
    这将触发 FastAPI 的 lifespan 关闭流程（清理 Node 进程）。
    """
    if IS_DOCKER:
        return {"message": "Not allowed in Docker mode."}

    print("Received shutdown request via API...")
    # 获取当前进程 ID 并发送终止信号
    # Windows 和 Linux/Mac 都支持 SIGTERM
    os.kill(os.getpid(), signal.SIGTERM)
    return {"message": "Shutting down..."}

from py.acpx_tools import check_acpx_available
@app.get("/api/acpx/status")
async def acpx_status():
    """返回 ACPX 的安装状态和环境信息"""
    return check_acpx_available()


@app.get("/api/system/data-path")
async def get_data_path():
    """获取当前的数据路径"""
    return {
        "path": USER_DATA_DIR,
        "is_docker": IS_DOCKER
    }

class PathUpdateReq(BaseModel):
    path: str

@app.post("/api/system/set-path")
async def set_data_path(req: PathUpdateReq):
    """修改数据路径"""
    success, msg = set_custom_user_data_dir(req.path)
    if success:
        return {"success": True, "new_path": msg}
    else:
        raise HTTPException(status_code=500, detail=msg)

@app.post("/api/system/reset-path")
async def reset_data_path():
    """重置数据路径"""
    success, msg = reset_user_data_dir()
    if success:
        return {"success": True, "path": msg}
    else:
        raise HTTPException(status_code=500, detail=msg)

from py.uv_api import router as uv_router
app.include_router(uv_router)

from py.node_api import router as node_router 
app.include_router(node_router)

from py.docker_api import router as docker_router 
app.include_router(docker_router)

from py.extensions import router as extensions_router

app.include_router(extensions_router)

from py.skills import router as skills_router

app.include_router(skills_router)

from py.sherpa_model_manager import router as sherpa_model_router
app.include_router(sherpa_model_router)

from py.moss_model_manager import router as moss_model_router
app.include_router(moss_model_router)

from py.ebd_model_manager import router as ebd_model_router
app.include_router(ebd_model_router)

from py.minilm_router import router as minilm_router
app.include_router(minilm_router)

from py.ebd_api import router as embedding_router
app.include_router(embedding_router)

from py.affection_api import router as affection_router
app.include_router(affection_router)

from py.diary_api import router as diary_router
app.include_router(diary_router)

mcp = FastApiMCP(
    app,
    name="Agent party MCP - chat with multiple agents",
    include_operations=["get_agents", "chat_with_agent_party"],
)

mcp.mount()

app.mount("/vrm", StaticFiles(directory=DEFAULT_VRM_DIR), name="vrm")
app.mount("/tha_models", StaticFiles(directory=DEFAULT_THA_DIR), name="tha_models")
app.mount("/tool_temp", StaticFiles(directory=TOOL_TEMP_DIR), name="tool_temp")
app.mount("/uploaded_files", StaticFiles(directory=UPLOAD_FILES_DIR), name="uploaded_files")
app.mount("/ext", StaticFiles(directory=EXT_DIR), name="ext")
app.mount("/", StaticFiles(directory=os.path.join(base_path, "static"), html=True), name="static")

# 简化main函数
if __name__ == "__main__":
    import uvicorn

    # 格式化显示地址
    display_host = "127.0.0.1" if HOST == "0.0.0.0" else HOST
    
    print("\n" + "="*50)
    print(f"🚀 后端服务已启动")
    print(f"🔗 本地运行地址: http://{display_host}:{PORT}")
    print(f"📖 API 文档地址: http://{display_host}:{PORT}/docs") # 如果是 FastAPI
    print("="*50 + "\n")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="warning"
    )
