import io
import json
import logging
import os
import shutil
import sys
import time
import asyncio
import aiosqlite
from pathlib import Path
from appdirs import user_data_dir

# ----------------- 1. 基础环境检测 (极速版) -----------------
APP_NAME = "Super-Agent-Party"
HOST = None
PORT = None

IS_DOCKER = os.environ.get("IS_DOCKER", "").lower() in ("1", "true")

def in_docker():
    return IS_DOCKER

def get_base_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    else:
        return os.path.abspath(".")

base_path = get_base_path()

# ----------------- 2. 路径定义 -----------------
# 1. 定义“锚点”路径（系统默认配置目录，无论怎么改路径，这个引导文件永远放在这）
ANCHOR_USER_DATA_DIR = user_data_dir(APP_NAME, roaming=True)
PATH_REDIRECT_FILE = os.path.join(ANCHOR_USER_DATA_DIR, 'path_config.json')

def get_effective_user_data_dir():
    """获取当前生效的数据目录"""
    if IS_DOCKER:
        return '/app/data'
    
    if os.path.exists(PATH_REDIRECT_FILE):
        try:
            with open(PATH_REDIRECT_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                custom_path = config.get("custom_user_data_dir")
                
                if custom_path:
                    # --- 增强防呆逻辑 ---
                    # 1. 必须是绝对路径 (防止用户输入 aaaa 这种相对路径)
                    if not os.path.isabs(custom_path):
                        logging.error(f"[Path] 自定义路径不是绝对路径: {custom_path}")
                        return ANCHOR_USER_DATA_DIR

                    # 2. 尝试创建目录并检查权限
                    os.makedirs(custom_path, exist_ok=True)
                    
                    # 3. 验证是否真的有写权限 (创建一个临时文件试试)
                    test_file = os.path.join(custom_path, '.path_test')
                    try:
                        with open(test_file, 'w') as f:
                            f.write('test')
                        os.remove(test_file)
                        return custom_path
                    except Exception:
                        logging.error(f"[Path] 自定义路径无写权限: {custom_path}")
                        return ANCHOR_USER_DATA_DIR
                        
        except Exception as e:
            logging.error(f"[Path] 读取路径配置异常，回退默认: {e}")
            pass
            
    return ANCHOR_USER_DATA_DIR

# 2. 动态获取 USER_DATA_DIR
USER_DATA_DIR = get_effective_user_data_dir()

# --- 核心目录 --- (这部分保持原样，但它们现在会跟随 USER_DATA_DIR 动态改变)
LOG_DIR = os.path.join(USER_DATA_DIR, 'logs')
MEMORY_CACHE_DIR = os.path.join(USER_DATA_DIR, 'memory_cache')
UPLOAD_FILES_DIR = os.path.join(USER_DATA_DIR, 'uploaded_files')
TOOL_TEMP_DIR = os.path.join(USER_DATA_DIR, 'tool_temp')
AGENT_DIR = os.path.join(USER_DATA_DIR, 'agents')
KB_DIR = os.path.join(USER_DATA_DIR, 'kb')
EXT_DIR = os.path.join(USER_DATA_DIR, "ext")
DEFAULT_ASR_DIR = os.path.join(USER_DATA_DIR, 'asr')
DEFAULT_TTS_DIR = os.path.join(USER_DATA_DIR, 'tts')
DEFAULT_EBD_DIR = os.path.join(USER_DATA_DIR, 'ebd')
DEFAULT_THA_DIR = os.path.join(base_path, 'tha_models')
THA_USER_MODELS_DIR = os.path.join(UPLOAD_FILES_DIR, 'tha_models')
# --- 跨平台全局Skills路径 ---
def get_global_skills_dir():
    """
    获取标准的全局Agent Skills目录，支持跨平台
    """
    home_dir = Path.home()
    if IS_DOCKER:
        docker_skills_dir = Path('/app/.agents/skills')
        docker_skills_dir.mkdir(parents=True, exist_ok=True)
        return str(docker_skills_dir)
    
    global_skills_dir = home_dir / '.agents' / 'skills'
    global_skills_dir.mkdir(parents=True, exist_ok=True)
    return str(global_skills_dir)

SKILLS_DIR = get_global_skills_dir()

# --- 配置文件 ---
SETTINGS_FILE = os.path.join(USER_DATA_DIR, 'settings.json')
CONFIG_BASE_PATH = os.path.join(base_path, 'config')
SETTINGS_TEMPLATE_FILE = os.path.join(CONFIG_BASE_PATH, 'settings_template.json')
BLOCKLIST_FILE = os.path.join(CONFIG_BASE_PATH, 'blocklist.json')

# --- 静态资源 ---
DEFAULT_VRM_DIR = os.path.join(base_path, 'vrm')
STATIC_DIR = os.path.join(base_path, "static")

# --- 数据库 ---
DATABASE_PATH = os.path.join(USER_DATA_DIR, 'super_agent_party.db')
COVS_PATH = os.path.join(USER_DATA_DIR, "conversations.db")

# 批量创建目录
dirs_to_create =[
    USER_DATA_DIR, LOG_DIR, MEMORY_CACHE_DIR, UPLOAD_FILES_DIR, 
    TOOL_TEMP_DIR, AGENT_DIR, KB_DIR, EXT_DIR, 
    DEFAULT_ASR_DIR, DEFAULT_TTS_DIR, DEFAULT_EBD_DIR, CONFIG_BASE_PATH, SKILLS_DIR,DEFAULT_THA_DIR,
    THA_USER_MODELS_DIR
]
for d in set(dirs_to_create):
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass

# ================== 新增：路径管理函数 ==================
def set_custom_user_data_dir(new_path):
    """设置新的数据目录并写入引导文件"""
    if IS_DOCKER:
        return False, "Docker环境下无法修改数据路径"
    
    try:
        # 1. 转换为绝对路径
        abs_path = os.path.abspath(new_path)
        
        # 2. 基本校验：不能是文件，必须是绝对路径
        if os.path.isfile(abs_path):
            return False, "目标路径是一个文件，请输入文件夹路径"
            
        # 3. 尝试创建并测试写入 (提前发现错误)
        os.makedirs(abs_path, exist_ok=True)
        test_file = os.path.join(abs_path, '.write_test')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        
        # 4. 写入引导文件
        os.makedirs(ANCHOR_USER_DATA_DIR, exist_ok=True)
        with open(PATH_REDIRECT_FILE, 'w', encoding='utf-8') as f:
            json.dump({"custom_user_data_dir": abs_path}, f, ensure_ascii=False, indent=2)
            
        return True, abs_path
    except Exception as e:
        return False, f"路径无效或无权限: {str(e)}"

def reset_user_data_dir():
    """重置回系统默认路径"""
    if IS_DOCKER:
        return False, "Docker环境下无法修改数据路径"
    try:
        if os.path.exists(PATH_REDIRECT_FILE):
            os.remove(PATH_REDIRECT_FILE)
        return True, ANCHOR_USER_DATA_DIR
    except Exception as e:
        return False, str(e)

# ----------------- 3. 关键修复：恢复全局 BLOCKLIST 变量 -----------------
# 兼容 py/load_files.py 的导入需求
# 虽然有一点点 I/O，但为了保证不报错，这里必须直接执行
blocklist_data = []
if os.path.exists(BLOCKLIST_FILE):
    try:
        with open(BLOCKLIST_FILE, 'r', encoding='utf-8') as f:
            blocklist_data = json.load(f)
    except Exception:
        pass
BLOCKLIST = set(blocklist_data)

# ----------------- 4. 工具函数 -----------------

_cached_default_settings = None
_db_init_done = False
_covs_db_init_done = False

def get_blocklist():
    """保留这个函数供未来使用"""
    return BLOCKLIST

def configure_host_port(host, port):
    global HOST, PORT
    HOST = host
    PORT = port

def get_host():
    return HOST or "127.0.0.1"

def get_port():
    # 优先级：环境变量 > 全局PORT > 默认3456
    env_port = os.environ.get('DYNAMIC_PORT')
    if env_port:
        return int(env_port)
    return PORT or 3456

def change_port(new_port):
    global PORT
    PORT = new_port

def get_default_settings_sync():
    global _cached_default_settings
    if _cached_default_settings is not None:
        return _cached_default_settings
    
    if os.path.exists(SETTINGS_TEMPLATE_FILE):
        try:
            with open(SETTINGS_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
                _cached_default_settings = json.load(f)
        except Exception:
            _cached_default_settings = {}
    else:
        _cached_default_settings = {}
    return _cached_default_settings

# ----------------- Agent Skills 初始化 -----------------

def _copy_default_skills_sync():
    """同步复制默认技能目录（在独立线程中执行以避免阻塞事件循环）"""
    src_skills_root = os.path.join(base_path, 'skills')
    dst_skills_root = SKILLS_DIR
    if not os.path.isdir(src_skills_root):
        logging.info("[Skills] 项目根目录无 skills/ 文件夹，跳过初始化复制。")
        return
    os.makedirs(dst_skills_root, exist_ok=True)
    try:
        import shutil
        for item_name in os.listdir(src_skills_root):
            src_path = os.path.join(src_skills_root, item_name)
            dst_path = os.path.join(dst_skills_root, item_name)
            if os.path.isdir(src_path):
                if os.path.exists(dst_path):
                    logging.debug(f"[Skills] 目标技能已存在，跳过: {item_name}")
                    continue
                shutil.copytree(src_path, dst_path)
                logging.info(f"[Skills] 已安装默认技能: {item_name}")
            else:
                logging.debug(f"[Skills] 忽略非文件夹项: {item_name}")
    except Exception as e:
        logging.error(f"[Skills] 复制默认技能时发生错误: {e}", exc_info=True)

async def _copy_default_skills():
    """异步包装：将技能复制操作卸载到独立线程"""
    await asyncio.to_thread(_copy_default_skills_sync)

# ----------------- 5. 初始化逻辑 -----------------

async def init_db():
    global _db_init_done
    if _db_init_done: return

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY,
                data TEXT NOT NULL
            )
        ''')
        await db.commit()
    _db_init_done = True

async def init_covs_db():
    global _covs_db_init_done
    if _covs_db_init_done: return
    
    Path(USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY,
                data TEXT NOT NULL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS group_memory (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                source_chat_id TEXT NOT NULL,
                source_message_id TEXT,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0.5,
                status TEXT NOT NULL DEFAULT 'active',
                version INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_used_at INTEGER,
                metadata_json TEXT
            )
        ''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_group_memory_group_status ON group_memory(group_id, status)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_group_memory_source_chat ON group_memory(source_chat_id)')
        await db.commit()
    _covs_db_init_done = True

# ----------------- 6. 业务功能函数 -----------------

async def clean_temp_files_task():
    try:
        await asyncio.to_thread(_clean_temp_files_sync)
    except Exception:
        pass

def _clean_temp_files_sync():
    if not os.path.exists(TOOL_TEMP_DIR): return
    threshold = time.time() - 7 * 24 * 60 * 60
    for filename in os.listdir(TOOL_TEMP_DIR):
        file_path = os.path.join(TOOL_TEMP_DIR, filename)
        try:
            if os.path.isfile(file_path):
                if os.path.getmtime(file_path) < threshold:
                    os.remove(file_path)
        except Exception:
            pass

def convert_to_opus_simple(audio_data):
    try:
        from pydub import AudioSegment
        import imageio_ffmpeg
        
        if not getattr(AudioSegment, 'converter_configured', False):
            try:
                ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                AudioSegment.converter = ffmpeg_path
                AudioSegment.converter_configured = True
            except Exception:
                logging.warning("imageio-ffmpeg execution failed")

        audio = None
        # 1. Container format
        try:
            audio_io = io.BytesIO(audio_data)
            audio = AudioSegment.from_file(audio_io)
        except Exception:
            pass
            
        # 2. Raw PCM
        if audio is None:
            try:
                audio = AudioSegment(
                    data=audio_data,
                    sample_width=2,
                    frame_rate=24000,
                    channels=1
                )
            except Exception as e:
                logging.error(f"Raw PCM read failed: {e}")
                return audio_data, False

        # 3. Export Opus
        audio = audio.set_frame_rate(16000).set_channels(1)
        out_io = io.BytesIO()
        audio.export(
            out_io,
            format="opus",
            codec="libopus",
            parameters=["-b:a", "16k", "-application", "voip"]
        )
        return out_io.getvalue(), True
    except ImportError:
        logging.error("pydub/ffmpeg not installed")
        return _wrap_pcm_to_wav(audio_data), False
    except Exception as e:
        logging.error(f"Opus conversion failed: {e}")
        return _wrap_pcm_to_wav(audio_data), False

def convert_to_amr_simple(audio_data: bytes) -> bytes:
    """
    将音频转换为企业微信 AMR 格式
    """
    try:
        from pydub import AudioSegment
        import io, os, subprocess, tempfile, shutil

        # 1. 自动定位 ffmpeg
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            logging.error("未找到 ffmpeg，请确保已安装并加入环境变量")
            return None

        # 2. 读取音频并标准化 (8000Hz, Mono)
        audio = AudioSegment.from_file(io.BytesIO(audio_data))
        audio = audio.set_frame_rate(8000).set_channels(1)
        
        # 3. 创建临时文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio.export(tmp.name, format="wav")
            wav_name = tmp.name
        amr_name = wav_name.replace(".wav", ".amr")
        
        try:
            # 4. 执行转换并捕获错误输出
            cmd = [
                ffmpeg_path, "-y", "-i", wav_name, 
                "-ar", "8000", "-ab", "12.2k", "-ac", "1", 
                "-c:a", "libopencore_amrnb", amr_name
            ]
            process = subprocess.run(cmd, capture_output=True, text=True)
            
            if process.returncode != 0:
                # 【核心日志】这里会告诉你为什么 exit 8
                logging.error(f"FFmpeg 转换失败 (Code {process.returncode})")
                logging.error(f"FFmpeg 错误详情: {process.stderr}")
                return None
            
            with open(amr_name, "rb") as f:
                return f.read()
        finally:
            if os.path.exists(wav_name): os.remove(wav_name)
            if os.path.exists(amr_name): os.remove(amr_name)

    except Exception as e:
        logging.error(f"AMR 转换流程异常: {e}")
        return None


def _wrap_pcm_to_wav(pcm_data):
    try:
        import wave
        wav_io = io.BytesIO()
        with wave.open(wav_io, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(24000)
            wav_file.writeframes(pcm_data)
        return wav_io.getvalue()
    except Exception:
        return pcm_data

# ----------------- 7. 配置读写 -----------------

def _migrate_old_tha_models():
    """将旧版THA模型从 uploaded_files/根目录 迁移到 uploaded_files/tha_models/ 子目录"""
    if not os.path.isdir(UPLOAD_FILES_DIR):
        return
    target_dir = THA_USER_MODELS_DIR
    os.makedirs(target_dir, exist_ok=True)
    
    for entry in os.listdir(UPLOAD_FILES_DIR):
        entry_path = os.path.join(UPLOAD_FILES_DIR, entry)
        # 跳过 tha_models 子目录自身
        if entry_path == target_dir:
            continue
        # 只处理子目录
        if not os.path.isdir(entry_path):
            continue
        # 检查是否包含 THA 模型文件
        onnx_file = os.path.join(entry_path, "model.onnx")
        mlp_dir = os.path.join(entry_path, "model.mlpackage")
        if os.path.exists(onnx_file) or os.path.isdir(mlp_dir):
            dest = os.path.join(target_dir, entry)
            if not os.path.exists(dest):
                try:
                    import shutil
                    shutil.move(entry_path, dest)
                    logging.info(f"[Migration] 已迁移THA模型目录: {entry} -> tha_models/{entry}")
                except Exception as e:
                    logging.warning(f"[Migration] 迁移THA模型失败 {entry}: {e}")

def _cleanup_model_paths_sync(user_settings, has_changes):
    """同步清理 VRM/THA 模型中文件不存在的残留条目（在独立线程中执行）"""
    from urllib.parse import urlparse
    
    vrm_config = user_settings.get("VRMConfig", {})
    vrm_user_models = vrm_config.get("userModels", [])
    if vrm_user_models:
        cleaned_vrm = []
        for model in vrm_user_models:
            model_path = model.get("path", "")
            if model_path:
                try:
                    parsed = urlparse(model_path)
                    local_path = os.path.join(UPLOAD_FILES_DIR, os.path.basename(parsed.path))
                except Exception:
                    local_path = os.path.join(UPLOAD_FILES_DIR, os.path.basename(model_path))
                if os.path.exists(local_path):
                    cleaned_vrm.append(model)
                else:
                    has_changes[0] = True
                    logging.info(f"[Cleanup] 移除无效VRM模型条目: {model.get('name', model.get('id', ''))} (文件不存在: {local_path})")
            else:
                cleaned_vrm.append(model)
        if len(cleaned_vrm) != len(vrm_user_models):
            vrm_config["userModels"] = cleaned_vrm
            selected_id = vrm_config.get("selectedModelId", "")
            default_models = vrm_config.get("defaultModels", [])
            if selected_id and not any(m.get("id") == selected_id for m in cleaned_vrm) and not any(m.get("id") == selected_id for m in default_models):
                if default_models:
                    vrm_config["selectedModelId"] = default_models[0].get("id", "alice")
                elif cleaned_vrm:
                    vrm_config["selectedModelId"] = cleaned_vrm[0].get("id", "alice")
                else:
                    vrm_config["selectedModelId"] = "alice"
    
    tha_config = user_settings.get("THAConfig", {})
    tha_user_models = tha_config.get("userModels", [])
    if tha_user_models:
        cleaned_tha = []
        for model in tha_user_models:
            model_id = model.get("id", "")
            if model_id:
                tha_model_dir = os.path.join(THA_USER_MODELS_DIR, model_id)
                onnx_file = os.path.join(tha_model_dir, "model.onnx")
                mlp_dir = os.path.join(tha_model_dir, "model.mlpackage")
                if os.path.isdir(tha_model_dir) and (os.path.exists(onnx_file) or os.path.isdir(mlp_dir)):
                    cleaned_tha.append(model)
                else:
                    has_changes[0] = True
                    logging.info(f"[Cleanup] 移除无效THA模型条目: {model.get('name', model_id)} (目录不存在或缺少model.onnx)")
            else:
                cleaned_tha.append(model)
        if len(cleaned_tha) != len(tha_user_models):
            tha_config["userModels"] = cleaned_tha
            selected_id = tha_config.get("selectedModelId", "")
            default_models = tha_config.get("defaultModels", [])
            all_tha = default_models + cleaned_tha
            if selected_id and not any(m.get("id") == selected_id for m in all_tha):
                if default_models:
                    tha_config["selectedModelId"] = default_models[0].get("id", "")
                elif cleaned_tha:
                    tha_config["selectedModelId"] = cleaned_tha[0].get("id", "")
                else:
                    tha_config["selectedModelId"] = ""

def deep_update(target: dict, source: dict):
    """递归合并 source 到 target，source 中的值优先。用于防止 autoSaveSettings 覆盖数据库中的完整配置。"""
    for key, value in source.items():
        if key not in target:
            target[key] = value
        elif isinstance(value, dict) and isinstance(target.get(key), dict):
            deep_update(target[key], value)
        else:
            target[key] = value


async def load_settings():
    await init_db()
    defaults = get_default_settings_sync().copy()
    
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute('SELECT data FROM settings WHERE id = 1') as cursor:
            row = await cursor.fetchone()
            if row:
                try:
                    user_settings = json.loads(row[0])
                except Exception:
                    user_settings = {}
                
                # Merge logic
                has_changes = [False]
                def merge_defaults(default_dict, target_dict):
                    for key, value in default_dict.items():
                        if key not in target_dict:
                            target_dict[key] = value
                            has_changes[0] = True
                        elif isinstance(value, dict) and isinstance(target_dict.get(key), dict):
                            merge_defaults(value, target_dict[key])
                
                merge_defaults(defaults, user_settings)
                
                # 清理 VRMConfig.userModels 和 THAConfig.userModels 中文件已不存在的残留条目（线程化避免阻塞事件循环）
                await asyncio.to_thread(
                    _cleanup_model_paths_sync, user_settings, has_changes
                )
                
                # 迁移旧版THA模型: 从 uploaded_files/根目录 迁移到 uploaded_files/tha_models/
                await asyncio.to_thread(_migrate_old_tha_models)
                
                if has_changes[0]:
                    await save_settings(user_settings)
                return user_settings
            else:
                # 尝试从旧 settings.json 迁移（兼容旧版本数据）
                if os.path.exists(SETTINGS_FILE):
                    try:
                        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                            user_settings = json.load(f)
                        logging.info(f"从旧版 settings.json 迁移用户设置: {SETTINGS_FILE}")
                        merge_defaults(defaults, user_settings)
                        await save_settings(user_settings)
                        return user_settings
                    except Exception as e:
                        logging.warning(f"从旧版 settings.json 迁移失败: {e}")
                
                if IS_DOCKER:
                    defaults["isdocker"] = True
                await save_settings(defaults)
                return defaults

async def save_settings(settings):
    data = json.dumps(settings, ensure_ascii=False, indent=2)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute('INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)', (data,))
        await db.commit()

async def load_covs():
    try:
        await init_covs_db()
        async with aiosqlite.connect(COVS_PATH) as db:
            async with db.execute('SELECT data FROM settings WHERE id = 1') as cursor:
                row = await cursor.fetchone()
                return json.loads(row[0]) if row else {"conversations": []}
    except Exception:
        return {"conversations": []}

async def save_covs(settings):
    data = json.dumps(settings, ensure_ascii=False, indent=2)
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute('INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)', (data,))
        await db.commit()

async def save_single_cov(conv_id, conv_data):
    covs = await load_covs()
    found = False
    for i, conv in enumerate(covs.get("conversations", [])):
        if conv.get("id") == conv_id:
            covs["conversations"][i] = conv_data
            found = True
            break
    if not found:
        covs.setdefault("conversations", []).append(conv_data)
    await save_covs(covs)