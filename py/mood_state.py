"""心境状态机（纯函数层）。

设计要点（对应《心境与羁绊设计规格》第 2、3 节）：

- 三条轴都不是"越高越好"的同一类东西：
    V 心情值：事件驱动的偏移，恢复目标是**中性基线**（默认 60）
    E 精力值：资源，恢复目标是**当前时段上限**（凌晨 20 / 正午 100）
    T 耐心值：资源，恢复目标是**上限 100**，但有地板 20
- 本模块**不做任何 IO、不读时钟**：所有函数的时间都从参数传进来，
  因此可以完全离线单测（不需要启动服务、不需要 LLM）。
- 时钟（py/mood_clock.py）负责"什么时候调用 advance"，
  本模块只负责"给定时间应该变成什么值"。
"""

import time
from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------- 常量

DEFAULT_BASELINE = {"V": 60.0, "E": 60.0, "T": 60.0}

# 时段上限表：(起始小时, 上限)。跨零点用 23 → 2 覆盖 23:00-01:59
CEILING_TABLE = [
    (6, 85),    # 06:00-08:59  刚醒
    (9, 100),   # 09:00-11:59  上午峰值
    (12, 80),   # 12:00-13:59  午间低谷
    (14, 95),   # 14:00-17:59  下午次高峰
    (18, 85),   # 18:00-22:59  渐降
    (23, 55),   # 23:00-01:59  犯困
    (2, 20),    # 02:00-05:59  深夜硬顶
]

TAU_E_HOURS = 3.0      # 精力恢复常数
TAU_T_MINUTES = 20.0   # 耐心恢复常数（快）
TAU_V_HOURS = 3.0      # 心情回落常数

SLEEP_GAP_SECONDS = 6 * 3600     # 超过这个间隔视为"睡了一觉"
MAX_GAP_SECONDS = 12 * 3600      # 追赶时最多推进这么久，防止时钟回拨/长时间关机

T_FLOOR = 20.0

# 单轮事件的夹紧范围（防止一句话造成剧烈跳变）
LIMIT_V = (-12.0, 6.0)
LIMIT_E = (-15.0, 0.0)     # 对话只会消耗精力，不会"聊出精力"
LIMIT_T = (-30.0, 0.0)

# 心情值的情感词（v1 规则版，够用且可测；v2 可换小模型校准）
POSITIVE_WORDS = (
    "谢谢", "感谢", "喜欢", "开心", "高兴", "哈哈", "好棒", "太棒", "厉害", "好听",
    "可爱", "温柔", "陪你", "辛苦了", "加油", "爱了", "牛", "赞", "乖", "摸摸",
)
NEGATIVE_WORDS = (
    "滚", "闭嘴", "烦", "讨厌", "垃圾", "废物", "傻", "蠢", "笨蛋", "恶心",
    "无聊", "难听", "丑", "去死", "没用", "失望", "难看", "别说了", "闭嘴吧",
)


# ---------------------------------------------------------------- 时段上限

def ceiling_from_hour(hour: int) -> int:
    """按小时（0-23）返回精力上限。

    表里每一档代表"从该小时起，到下一档之前"：
    02:00 的 20 一直延续到 05:59；00:00-01:59 属于 23:00 那一档（55）。
    """
    h = int(hour) % 24
    if h < 2:
        return 55
    cap = 20
    for start, value in sorted(CEILING_TABLE, key=lambda x: x[0]):
        if start <= h:
            cap = value
    return cap


def ceiling(ts: Optional[float] = None) -> int:
    """按本地时间返回当前时段的精力上限。"""
    if ts is None:
        ts = time.time()
    return ceiling_from_hour(time.localtime(ts).tm_hour)


def next_boundary_ts(ts: Optional[float] = None) -> float:
    """返回下一个时段边界的 epoch 时间（用于把下一次唤醒对齐到整点）。"""
    if ts is None:
        ts = time.time()
    lt = time.localtime(ts)
    starts = sorted(h for h, _ in CEILING_TABLE)
    # 候选边界：今天剩余的起始小时 + 明天的全部
    candidates = []
    day_start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))
    for h in starts:
        t = day_start + h * 3600
        if t > ts + 1:
            candidates.append(t)
    tomorrow = day_start + 86400
    for h in starts:
        candidates.append(tomorrow + h * 3600)
    return min(candidates)


# ---------------------------------------------------------------- 状态构造

def default_state(baseline: Optional[Dict[str, float]] = None) -> Dict:
    b = dict(DEFAULT_BASELINE)
    if baseline:
        for k in ("V", "E", "T"):
            try:
                if baseline.get(k) is not None:
                    b[k] = float(baseline[k])
            except (TypeError, ValueError):
                pass
    now = time.time()
    cap = ceiling(now)
    return {
        "V": float(b["V"]),
        "E": float(min(b["E"], cap)),
        "T": float(max(b["T"], T_FLOOR)),
        "baseline": b,
        "updated_at": now,
        "turns": 0,
        "recent_deltas": [],
    }


def _as_float(value, default: float) -> float:
    """把任意来源（坏文件、手改 JSON）的值安全转成 float。"""
    try:
        f = float(value)
        if f != f or f in (float('inf'), float('-inf')):
            return default
        return f
    except (TypeError, ValueError):
        return default


def clamp_axis(axis: str, value: float, ts: Optional[float] = None) -> float:
    if axis == "V":
        return max(0.0, min(100.0, value))
    if axis == "E":
        return max(0.0, min(float(ceiling(ts)), value))
    if axis == "T":
        return max(T_FLOOR, min(100.0, value))
    return value


# ---------------------------------------------------------------- 时间推进

def advance(state: Dict, now_ts: Optional[float] = None) -> Dict:
    """把状态推进到 now_ts（纯计算，返回新 dict，不落盘）。

    - V 向基线（中性中间值）回落
    - E 向"当前时段上限"恢复，并被上限硬钳制
    - T 向 100 恢复，且有地板 20
    - 间隔超过 6 小时视为睡了一觉
    """
    if now_ts is None:
        now_ts = time.time()

    # 注意：这里必须「复制原 dict 再改」，不能用白名单重建——
    # 否则 state 里的其它字段（如 manual_lock_until、未来的扩展字段）会被抹掉。
    # 审核员发现过这个 P0：手动冻结在第一次 tick 后就整键消失。
    new = dict(state) if isinstance(state, dict) else {}
    new["V"] = _as_float(new.get("V"), 60.0)
    new["E"] = _as_float(new.get("E"), 60.0)
    new["T"] = _as_float(new.get("T"), 60.0)
    _base = new.get("baseline")
    new["baseline"] = dict(_base) if isinstance(_base, dict) else dict(DEFAULT_BASELINE)
    new["updated_at"] = _as_float(new.get("updated_at"), now_ts)
    new["turns"] = int(new.get("turns") or 0)
    _deltas = new.get("recent_deltas")
    new["recent_deltas"] = list(_deltas) if isinstance(_deltas, list) else []
    base_v = _as_float(new["baseline"].get("V"), 60.0)

    # 手动冻结：到期归零；未到期则"只更新时间戳与钳制，不做衰减/恢复"。
    # 审核员 P0 的深层问题：只跳过"消耗"还不够——冻结期内数值仍会被节拍推向基线/上限（10→21.5），
    # 冻结必须让三条值保持不动。
    lock_until = _as_float(new.get("manual_lock_until"), 0.0)
    if lock_until and lock_until <= now_ts:
        new["manual_lock_until"] = 0.0
        lock_until = 0.0
    if lock_until > now_ts:
        # 时间戳只允许前进：回拨时不要写成过去值，否则冻结结束后的第一次推进会被当成"睡了很久"（审核员第二轮）
        new["updated_at"] = max(new["updated_at"], now_ts)
        new["E"] = clamp_axis("E", new["E"], now_ts)
        new["T"] = clamp_axis("T", new["T"], now_ts)
        new["V"] = clamp_axis("V", new["V"], now_ts)
        return new

    dt = now_ts - new["updated_at"]
    if dt <= 0:
        # 时钟回拨或同一时刻重复推进：只做上限钳制，**不把 updated_at 写成过去时间**。
        # 否则下一次 tick 会把这段"过去"当成睡了很久，导致 E 暴涨（审核员 P1）。
        new["E"] = clamp_axis("E", new["E"], now_ts)
        new["T"] = clamp_axis("T", new["T"], now_ts)
        new["V"] = clamp_axis("V", new["V"], now_ts)
        return new
    dt = min(dt, MAX_GAP_SECONDS)

    if dt >= SLEEP_GAP_SECONDS:
        cap = ceiling(now_ts)
        new["E"] = cap * 0.9
        new["T"] = new["T"] + (100.0 - new["T"]) * 0.9
        new["V"] = new["V"] + (base_v - new["V"]) * 0.7
    else:
        hours = dt / 3600.0
        # E：向当前上限渐近
        cap = float(ceiling(now_ts))
        k_e = 1.0 - pow(2.718281828459045, -hours / TAU_E_HOURS)
        new["E"] = new["E"] + (cap - new["E"]) * k_e
        # T：向上限 100 渐近（分钟级）
        k_t = 1.0 - pow(2.718281828459045, -(dt / 60.0) / TAU_T_MINUTES)
        new["T"] = new["T"] + (100.0 - new["T"]) * k_t
        # V：向中性基线回落
        k_v = 1.0 - pow(2.718281828459045, -hours / TAU_V_HOURS)
        new["V"] = new["V"] + (base_v - new["V"]) * k_v

    new["updated_at"] = now_ts
    new["E"] = clamp_axis("E", new["E"], now_ts)
    new["T"] = clamp_axis("T", new["T"], now_ts)
    new["V"] = clamp_axis("V", new["V"], now_ts)
    return new


# ---------------------------------------------------------------- 单轮事件

def _count_hits(text: str, words) -> int:
    if not text:
        return 0
    return sum(1 for w in words if w in text)


def estimate_turn_deltas(user_text: str, assistant_text: str = "",
                         tool_calls: int = 0, current_v: Optional[float] = None,
                         baseline_v: float = 60.0) -> Tuple[float, float, float]:
    """根据一轮对话估算三条轴的增量（v1 规则版）。

    返回 (dV, dE, dT)，都是"已经夹紧"的值：
      - dV：被夸/被关心升，被否定/被骂降，普通闲聊微升
      - dE：按交互量消耗（消息越长越费神），单轮有上限
      - dT：按认知负荷消耗（长需求、工具调用），单轮有上限
    """
    user_text = user_text or ""
    assistant_text = assistant_text or ""

    pos = _count_hits(user_text, POSITIVE_WORDS)
    neg = _count_hits(user_text, NEGATIVE_WORDS)

    d_v = 0.0
    if pos:
        d_v += min(6.0, 2.0 + 1.5 * (pos - 1))
    if neg:
        d_v -= min(12.0, 4.0 + 3.0 * (neg - 1))
    if not pos and not neg and user_text.strip():
        # 普通闲聊给一点点正向，但必须"边际递减"：
        # 只在低于基线时才补，且越接近基线补得越少，避免长会话把 V 单调推到 100（审核员 P3-3）
        if current_v is None:
            d_v += 0.2
        else:
            room = max(0.0, min(1.0, (baseline_v - current_v) / 40.0))
            d_v += 0.4 * room
    if user_text.count("!") >= 3 or user_text.count("！") >= 3:
        d_v += 1.0        # 情绪强度加成
    d_v = max(LIMIT_V[0], min(LIMIT_V[1], d_v))

    # 精力：基础 1 点 + 长度项；用户话越多越费神；单轮不超过 15
    cost_e = 1.0 + min(6.0, len(user_text) / 120.0) + min(3.0, len(assistant_text) / 400.0)
    d_e = -min(abs(LIMIT_E[0]), cost_e)

    # 耐心：长需求 + 工具调用 → 消耗；短句闲聊几乎不耗
    load = min(3.0, len(user_text) / 300.0) + 0.5 * max(0, int(tool_calls or 0))
    d_t = -min(abs(LIMIT_T[0]), 3.0 + load * 8.0) if load > 0.2 else 0.0

    return d_v, d_e, d_t


def apply_deltas(state: Dict, d_v: float = 0.0, d_e: float = 0.0, d_t: float = 0.0,
                 reason: str = "", now_ts: Optional[float] = None) -> Dict:
    """施加单轮增量（先补齐时间，再叠加），返回新 dict。"""
    if now_ts is None:
        now_ts = time.time()
    new = advance(state, now_ts)

    new["V"] = clamp_axis("V", new["V"] + d_v, now_ts)
    new["E"] = clamp_axis("E", new["E"] + d_e, now_ts)
    new["T"] = clamp_axis("T", new["T"] + d_t, now_ts)
    new["turns"] = int(new.get("turns") or 0) + 1

    if reason and (abs(d_v) >= 1.0 or abs(d_e) >= 1.0 or abs(d_t) >= 1.0):
        new["recent_deltas"] = (new.get("recent_deltas") or [])[-49:] + [{
            "at": int(now_ts),
            "dV": round(d_v, 1), "dE": round(d_e, 1), "dT": round(d_t, 1),
            "reason": reason, "manual": False,
        }]
    return new


# ---------------------------------------------------------------- 派生标签

def main_axis(state: Dict) -> Optional[str]:
    """返回主导轴："E_low"/"E_high"/"V_low"/"V_high"/"T_low"/"T_high"/"ET_low"，平稳返回 None。

    双低（又累又烦）单独成一档，因为它是最常见也最有质感的组合。
    """
    base = state.get("baseline") if isinstance(state.get("baseline"), dict) else DEFAULT_BASELINE
    base_v = _as_float(base.get("V"), 60.0)
    base_e = _as_float(base.get("E"), 60.0)
    base_t = _as_float(base.get("T"), 60.0)
    dev = {
        "V": _as_float(state.get("V"), 60.0) - base_v,
        "E": _as_float(state.get("E"), 60.0) - base_e,
        "T": _as_float(state.get("T"), 60.0) - base_t,
    }
    # 精力/耐心是"资源"，低于基线即视为消耗；心情则是双向
    strong_low = [k for k in ("E", "T") if dev[k] <= -15]
    if len(strong_low) == 2:
        return "ET_low"

    candidates = []
    for k, d in dev.items():
        if abs(d) < 15:
            continue
        candidates.append((abs(d), k, "low" if d < 0 else "high"))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    _, axis, direction = candidates[0]
    if axis in ("E", "T") and direction == "high":
        # 精力/耐心只关心"低"（满了不需要特别嘱咐）
        return None
    return f"{axis}_{direction}"


def snapshot(state: Dict, now_ts: Optional[float] = None) -> Dict:
    """给 UI / 渲染层用的快照（含上限、派生档位、冻结截止时间）。

    所有取值都走 _as_float：坏文件（V="abc"、baseline.V="abc"）也不会把异常抛到 UI/聊天路径。
    """
    if now_ts is None:
        now_ts = time.time()
    if not isinstance(state, dict):
        state = {}
    base = state.get("baseline") if isinstance(state.get("baseline"), dict) else {}
    deltas = state.get("recent_deltas")
    deltas = deltas if isinstance(deltas, list) else []
    return {
        "V": round(_as_float(state.get("V"), 60.0), 1),
        "E": round(_as_float(state.get("E"), 60.0), 1),
        "T": round(_as_float(state.get("T"), 60.0), 1),
        "baselineV": round(_as_float(base.get("V"), 60.0), 1),
        "ceiling": ceiling(now_ts),
        "axis": main_axis(state),
        "turns": int(_as_float(state.get("turns"), 0)),
        "updated_at": int(now_ts),
        "manual_lock_until": int(_as_float(state.get("manual_lock_until"), 0.0)),
        "recent_deltas": deltas[-5:],
    }
