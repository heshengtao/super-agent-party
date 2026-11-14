"""心境时钟：唯一的状态写入者。

职责（对应规格第 3 节）：
- 每 `tickMinutes` 分钟推进一次状态；下一次唤醒对齐到"时段边界"，保证整点钳制准时；
- 对话事件**不进节拍**：由 push_turn() 立即 advance + apply_deltas；
- 启动时做一次追赶（catch-up），把关机期间的时间补上；
- 睡醒/系统时间跳变用"墙钟 vs 单调钟"检测；
- 状态按角色存 `<USER_DATA_DIR>/mood/<character_id>.json`，原子写 + 去抖；
- 变化显著时向 WebSocket 广播，供 UI 实时刷新。
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Optional

from py import mood_state as ms

try:
    from py.get_setting import USER_DATA_DIR
except Exception:  # 单元测试/独立脚本下的兜底
    USER_DATA_DIR = os.path.abspath('.')

logger = logging.getLogger(__name__)

MOOD_DIR = os.path.join(USER_DATA_DIR, 'mood')
PERSIST_MIN_INTERVAL = 60          # 秒：落盘去抖
BROADCAST_MIN_INTERVAL = 5         # 秒：广播去抖
MANUAL_LOCK_DEFAULT_MINUTES = 30


def _char_id(settings: Optional[dict]) -> str:
    try:
        ms_cfg = (settings or {}).get("memorySettings") or {}
        mem_id = ms_cfg.get("selectedMemory")
        if mem_id:
            return str(mem_id)
    except Exception:
        pass
    return "default"


def _mood_cfg(settings: Optional[dict]) -> dict:
    return ((settings or {}).get("moodSettings") or {}) if settings else {}


def _path_for(char_id: str) -> str:
    safe = "".join(c for c in str(char_id) if c.isalnum() or c in "-_")
    return os.path.join(MOOD_DIR, f"{safe or 'default'}.json")


class MoodClock:
    """全局单例。持有内存状态 + 锁 + 后台任务。"""

    def __init__(self):
        self._states: Dict[str, Dict] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._last_persist: Dict[str, float] = {}
        self._last_broadcast: Dict[str, float] = {}
        self._mono_at: Dict[str, float] = {}
        self._last_snapshot: Dict[str, Dict] = {}

    # ------------------------------------------------ 存取
    def _lock(self, char_id: str) -> asyncio.Lock:
        if char_id not in self._locks:
            self._locks[char_id] = asyncio.Lock()
        return self._locks[char_id]

    def _load(self, char_id: str, settings: Optional[dict] = None) -> Dict:
        if char_id in self._states:
            return self._states[char_id]
        path = _path_for(char_id)
        state = None
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    state = json.load(f)
            except Exception as e:
                logger.warning(f"[Mood] 读取 {path} 失败，重建状态: {e}")
        if not isinstance(state, dict) or "V" not in state:
            state = ms.default_state((_mood_cfg(settings) or {}).get("baseline"))
        else:
            # 坏文件兜底：三个轴、baseline 的结构与**内部数值**、recent_deltas 都要校验，
            # 任何一项不合法就整份重建——否则基线里写了 baseline.V="abc" 时，
            # 心境会永久静默（每轮抛异常且不自愈）〔审核员第二轮 P2-1 补全〕。
            def _num(x):
                return isinstance(x, (int, float)) and not isinstance(x, bool) \
                    and x == x and abs(x) != float('inf')

            base = state.get("baseline")
            base_ok = isinstance(base, dict) and all(
                _num(base.get(k)) and 0.0 <= float(base.get(k)) <= 100.0
                for k in ("V", "E", "T") if k in base)
            ok = all(_num(state.get(k)) for k in ("V", "E", "T"))
            ok = ok and base_ok and isinstance(state.get("recent_deltas", []), list)
            if not ok:
                logger.warning(f"[Mood] {path} 数值异常，重建状态")
                state = ms.default_state((_mood_cfg(settings) or {}).get("baseline"))
        self._states[char_id] = state
        self._mono_at[char_id] = time.perf_counter()
        return state

    def _persist(self, char_id: str, force: bool = False):
        now = time.time()
        last = self._last_persist.get(char_id, 0)
        if not force and now - last < PERSIST_MIN_INTERVAL:
            return
        state = self._states.get(char_id)
        if not state:
            return
        path = _path_for(char_id)
        tmp = path + '.tmp'
        try:
            # makedirs 也放进 try：目录无写权限时不能把异常抛到对话路径上（审核员 P2）
            os.makedirs(MOOD_DIR, exist_ok=True)
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)     # 原子替换，防止写一半断电
            self._last_persist[char_id] = now
        except Exception as e:
            logger.warning(f"[Mood] 落盘失败: {e}")

    # ------------------------------------------------ 休眠检测
    def _sleep_gap_detected(self, char_id: str) -> bool:
        """墙钟比单调钟跑得快很多 → 系统睡过觉。"""
        mono = self._mono_at.get(char_id)
        state = self._states.get(char_id)
        if mono is None or not state:
            return False
        wall_delta = time.time() - float(state.get("updated_at") or 0)
        mono_delta = time.perf_counter() - mono
        return (wall_delta - mono_delta) > 60

    # ------------------------------------------------ 对外接口
    def snapshot(self, settings: Optional[dict] = None, now_ts: Optional[float] = None) -> Dict:
        """同步读快照（不推进、不加锁）：给渲染层和 UI 用。"""
        char_id = _char_id(settings)
        state = self._load(char_id, settings)
        return ms.snapshot(state, now_ts)

    async def tick(self, settings: Optional[dict] = None, now_ts: Optional[float] = None,
                   broadcast: bool = True) -> Dict:
        """推进一次（时间驱动）。"""
        char_id = _char_id(settings)
        if now_ts is None:
            now_ts = time.time()
        async with self._lock(char_id):
            state = self._load(char_id, settings)
            new = ms.advance(state, now_ts)
            self._states[char_id] = new
            self._mono_at[char_id] = time.perf_counter()
            self._maybe_record_tick(char_id, state, new)
            self._persist(char_id)
            snap = ms.snapshot(new, now_ts)
        if broadcast and self._should_broadcast(snap, char_id):
            await self._broadcast(snap, char_id)
        return snap

    async def push_turn(self, settings: Optional[dict], user_text: str, assistant_text: str = "",
                        tool_calls: int = 0, reason: str = "对话") -> Dict:
        """对话事件（立即应用，不走节拍）。"""
        char_id = _char_id(settings)
        now_ts = time.time()

        async with self._lock(char_id):
            # 先 _load 再读状态：否则会话中刚切到"还没加载过"的角色卡时，
            # 冻结标记读不到，首轮会绕开冻结（审核员第二轮 P2）。
            state = self._load(char_id, settings)
            lock_until = float(state.get("manual_lock_until") or 0)
            manual_locked = lock_until > now_ts
            base_v = float(((state.get("baseline") or {}) or {}).get("V", 60.0))

            d_v, d_e, d_t = ms.estimate_turn_deltas(
                user_text, assistant_text, tool_calls,
                current_v=state.get("V"), baseline_v=base_v)
            if manual_locked:
                d_v = d_e = d_t = 0.0     # 手动调整冻结期间不消耗也不漂移

            new = ms.apply_deltas(state, d_v, d_e, d_t, reason=reason, now_ts=now_ts)
            self._states[char_id] = new
            self._mono_at[char_id] = time.perf_counter()
            self._persist(char_id)
            snap = ms.snapshot(new, now_ts)
        if self._should_broadcast(snap, char_id):
            await self._broadcast(snap, char_id)
        return snap

    async def set_manual(self, settings: Optional[dict], v: Optional[float] = None,
                         e: Optional[float] = None, t: Optional[float] = None,
                         freeze_minutes: Optional[int] = None) -> Dict:
        """手动拖动：设值并冻结自动写入一段时间。"""
        char_id = _char_id(settings)
        now_ts = time.time()
        cfg = _mood_cfg(settings)
        if freeze_minutes is None:
            lock_cfg = cfg.get("manualLockMinutes")
            # 注意：0 是合法值（=不冻结），不能用 `or 30` 吞掉
            freeze_minutes = (MANUAL_LOCK_DEFAULT_MINUTES if lock_cfg is None else int(lock_cfg))
        # 防御性夹紧：API 层已经夹过，这里再夹一次，防止直接调本函数时传出天文数字
        freeze_minutes = max(0, min(int(freeze_minutes), 24 * 60))
        async with self._lock(char_id):
            state = self._load(char_id, settings)
            new = ms.advance(state, now_ts)
            if v is not None:
                new["V"] = ms.clamp_axis("V", float(v), now_ts)
            if e is not None:
                new["E"] = ms.clamp_axis("E", float(e), now_ts)
            if t is not None:
                new["T"] = ms.clamp_axis("T", float(t), now_ts)
            new["manual_lock_until"] = now_ts + max(0, int(freeze_minutes)) * 60
            new["recent_deltas"] = (new.get("recent_deltas") or [])[-49:] + [{
                "at": int(now_ts), "dV": 0, "dE": 0, "dT": 0,
                "reason": "手动调整", "manual": True,
            }]
            self._states[char_id] = new
            self._persist(char_id, force=True)
            snap = ms.snapshot(new, now_ts)
            snap["manual_lock_until"] = int(new["manual_lock_until"])
        await self._broadcast(snap, char_id, force=True)
        return snap

    async def reset(self, settings: Optional[dict]) -> Dict:
        char_id = _char_id(settings)
        async with self._lock(char_id):
            self._states[char_id] = ms.default_state((_mood_cfg(settings) or {}).get("baseline"))
            self._persist(char_id, force=True)
            snap = ms.snapshot(self._states[char_id])
        await self._broadcast(snap, char_id, force=True)
        return snap

    # ------------------------------------------------ 内部
    def _maybe_record_tick(self, char_id: str, old: Dict, new: Dict):
        """时间推进造成的显著变化也记一条，方便 UI 解释。"""
        dv = float(new.get("V", 0)) - float(old.get("V", 0))
        de = float(new.get("E", 0)) - float(old.get("E", 0))
        dt_ = float(new.get("T", 0)) - float(old.get("T", 0))
        if max(abs(dv), abs(de), abs(dt_)) < 1.0:
            return
        new.setdefault("recent_deltas", [])
        new["recent_deltas"] = new["recent_deltas"][-49:] + [{
            "at": int(new.get("updated_at") or time.time()),
            "dV": round(dv, 1), "dE": round(de, 1), "dT": round(dt_, 1),
            "reason": "时间流逝", "manual": False,
        }]

    def _should_broadcast(self, snap: Dict, char_id: str = "default") -> bool:
        now = time.time()
        if now - self._last_broadcast.get(char_id, 0) < BROADCAST_MIN_INTERVAL:
            return False
        # 按角色记录上次快照：多角色切换时不会拿 A 的旧值去和 B 比（审核员 P2）
        prev = self._last_snapshot.get(char_id)
        self._last_snapshot[char_id] = snap
        if not prev:
            return True
        changed = max(abs(snap["V"] - prev["V"]), abs(snap["E"] - prev["E"]), abs(snap["T"] - prev["T"]))
        return changed >= 0.5 or snap.get("axis") != prev.get("axis")

    async def _broadcast(self, snap: Dict, char_id: str = "default", force: bool = False):
        try:
            from py.ws_manager import ws_manager
            await ws_manager.broadcast({"type": "mood_update", "data": snap})
            self._last_broadcast[char_id] = time.time()
        except Exception:
            pass    # 没有前端连接时静默失败，不影响对话

    # ------------------------------------------------ 生命周期
    def next_wake_seconds(self, settings: Optional[dict] = None) -> float:
        """下一次唤醒间隔：min(节拍, 距下一个时段边界)。"""
        cfg = _mood_cfg(settings)
        tick_min = float(cfg.get("tickMinutes") or 5)
        tick_sec = max(60.0, min(30 * 60.0, tick_min * 60.0))
        now = time.time()
        try:
            to_boundary = ms.next_boundary_ts(now) - now
        except Exception:
            to_boundary = tick_sec
        return max(5.0, min(tick_sec, to_boundary))

    async def start(self, get_settings):
        """启动后台节拍。get_settings 是一个可调用对象，返回当前 settings dict。"""
        if self._running:
            return
        self._running = True
        # 启动追赶：把关机期间的时间补上
        try:
            settings = get_settings()
            if _mood_cfg(settings).get("enabled"):
                await self.tick(settings, broadcast=False)
                logger.info("[Mood] 启动追赶完成")
        except Exception as e:
            logger.warning(f"[Mood] 启动追赶失败: {e}")
        self._task = asyncio.create_task(self._loop(get_settings))
        logger.info("[Mood] 心境时钟已启动")

    async def _loop(self, get_settings):
        while self._running:
            try:
                settings = await get_settings() if asyncio.iscoroutinefunction(get_settings) else get_settings()
                if _mood_cfg(settings).get("enabled"):
                    # 休眠检测：睡醒后先补齐
                    char_id = _char_id(settings)
                    if self._sleep_gap_detected(char_id):
                        logger.info("[Mood] 检测到休眠，执行追赶")
                    await self.tick(settings)
                await asyncio.sleep(self.next_wake_seconds(settings))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[Mood] 时钟异常: {e}")
                await asyncio.sleep(60)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except Exception:
                pass
            self._task = None
        for cid in list(self._states.keys()):
            self._persist(cid, force=True)
        logger.info("[Mood] 心境时钟已停止")


mood_clock = MoodClock()
