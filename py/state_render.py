"""定句渲染层：把"会变的状态"编译成一小段确定的话，注入 system 尾部。

设计原则（《心境与羁绊设计规格》第 4 节）：
- **模型永远看不到数字**：只给它"该怎么说话"的句子。
- 句子放 `config/locales.json` 的 `mood.*`（可翻译、可编辑、可 A/B），缺省时用内置中文兜底。
- 幂等 + 可刷新：注入时用自生成标记包裹，下一轮只删带标记的整段（替换语义）。
- 开关关闭时返回空串，行为与上游原版一致。
"""

import json
import os
import re
import time
from typing import Dict, Optional

MOOD_MARKER = "【此刻】"

# 注入块的删除锚点：只认这两个标记，不认 header/footer 文本。
# 好处：语言切换、改文案、块被截断都能清干净；角色卡正文即使抄了整段定句也不会被误删。
MARK_OPEN = "<!--sap-mood-->"
MARK_CLOSE = "<!--/sap-mood-->"

# 截断兜底用的"最后一行"锚点（中英各一）
_FOOTER_ANCHORS = ("底线：", "Bottom line:")

_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config', 'locales.json')

_FALLBACK = {
    "mood.header": "【此刻】(不要复述这段，也不要说明你正在按它说话)",
    "mood.line_prefix": "心境：",
    "mood.E_low": "你现在很累，句子要短、不铺垫、不主动开新话题",
    "mood.E_high": "你现在很有精神，愿意多聊两句",
    "mood.V_low": "你现在提不起劲，语气收敛，不太主动逗人",
    "mood.V_high": "你现在心情不错，语气轻快，愿意主动搭话",
    "mood.T_low": "你现在耐心不多，直接给结论，少客套",
    "mood.T_high": "你现在很从容，愿意解释、愿意铺垫",
    "mood.ET_low": "你现在又累又烦：话少、直接、语气冲一点也正常",
    "mood.steady": "你现在状态平常，正常说话就好",
    "mood.lapse_on": "烦躁时可以过火一点，不用刻意克制",
    "mood.lapse_off": "烦躁时只表现为话少、直给，不要攻击对方",
    "mood.footer": "底线：只影响语气，不影响把事做完。",
}

_cache = {"mtime": 0.0, "data": {}}


def _load_phrases() -> Dict[str, str]:
    """读取 locales.json 里的 mood.* 句子，带 mtime 缓存。"""
    try:
        mtime = os.path.getmtime(_CONFIG_PATH)
    except OSError:
        return {}
    if _cache["mtime"] == mtime and _cache["data"]:
        return _cache["data"]
    try:
        with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        merged = {}
        for lang_keys in raw.values():
            if isinstance(lang_keys, dict):
                for k, v in lang_keys.items():
                    if k.startswith('mood.') and isinstance(v, str) and v:
                        merged.setdefault(k, v)
        _cache["data"] = merged
        _cache["mtime"] = mtime
        return merged
    except Exception:
        return {}


def _phrases(settings: Optional[dict]) -> Dict[str, str]:
    base = dict(_FALLBACK)
    loaded = _load_phrases()
    lang = 'zh-CN'
    try:
        lang = (settings or {}).get('currentLanguage') or 'zh-CN'
        with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        table = raw.get(lang) or raw.get('zh-CN') or {}
        for k, v in table.items():
            if k.startswith('mood.') and isinstance(v, str) and v:
                base[k] = v
    except Exception:
        base.update(loaded)
    return base


def _enabled(settings: Optional[dict]) -> bool:
    return bool(((settings or {}).get('moodSettings') or {}).get('enabled'))


def _header_of(settings: Optional[dict]) -> str:
    return (_phrases(settings) or {}).get("mood.header") or _FALLBACK["mood.header"]


def render(settings: Optional[dict], snapshot: Optional[dict] = None) -> str:
    """生成心境块文本（带自生成标记）；关闭时返回空串。

    标记 `<!--sap-mood-->` / `<!--/sap-mood-->` 是**删除锚点**：注入时包上，
    下次只删带锚点的整段。这样语言切换、改文案、截断都能清干净，
    而又绝不会碰到角色卡正文里"碰巧抄了一整段定句"的情况（审核员第三轮 P2-1/P3-2/P3-3）。
    """
    if not _enabled(settings):
        return ""

    p = _phrases(settings)
    snap = snapshot or {}
    axis = snap.get('axis')
    key = f"mood.{axis}" if axis else "mood.steady"
    sentence = p.get(key) or p.get("mood.steady") or _FALLBACK["mood.steady"]

    allow_lapse = bool(((settings or {}).get('moodSettings') or {}).get('allowLapse'))
    lapse_line = p.get("mood.lapse_on" if allow_lapse else "mood.lapse_off") or ""

    lines = [
        p.get("mood.header", _FALLBACK["mood.header"]),
        (p.get("mood.line_prefix", "") or "") + sentence,
    ]
    if lapse_line:
        lines.append(lapse_line)
    lines.append(p.get("mood.footer", _FALLBACK["mood.footer"]))
    return MARK_OPEN + "\n" + "\n".join(lines) + "\n" + MARK_CLOSE + "\n"


def strip_block(content: str, settings: Optional[dict] = None) -> str:
    """摘掉带标记的心境块（替换语义）。

    只认标记，**不再**依赖 header/footer 文本或语言：
      - 语言切换、改文案、截断都能清掉旧块（P2-1/P3-2）；
      - 角色卡正文里即使抄了一整段定句，只要没有标记就不会被删（P3-3）；
      - 没有标记时原样返回，不动任何排版（P3-4）。
    """
    if not content:
        return content or ''
    # 1) 完整块（含标记）
    content = re.sub(re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?',
                     '', content, flags=re.S)
    # 2) 只有开标记、没有闭标记（块被截断）：
    #    先尝试删到最后一个"底线"行；连底线都没写出来时，因为块总是追加在末尾，
    #    直接删到文本结尾（审核员第四轮 P2：此前只删一行，会留下"【此刻】+半句"）。
    while MARK_OPEN in content:
        i = content.find(MARK_OPEN)
        rest = content[i:]
        j = -1
        for anchor in _FOOTER_ANCHORS:
            j = max(j, rest.rfind(anchor))
        if j >= 0:
            e = rest.find('\n', j)
            end = len(rest) if e < 0 else e + 1
            content = content[:i] + rest[end:]
            continue
        # 没有底线行：说明这块是被截断的。我们的块**永远追加在末尾**，
        # 所以从开标记删到文本结尾就是正确语义（审核员第四轮 P2：此前只删一行，会留下残句）。
        content = content[:i]
        break
    return content



def render_for_state(settings: Optional[dict], char_id: Optional[str] = None) -> str:
    """便捷入口：直接从心境时钟取快照再渲染（异常时返回空串，不影响对话）。"""
    if not _enabled(settings):
        return ""
    try:
        from py.mood_clock import mood_clock
        snap = mood_clock.snapshot(settings)
        return render(settings, snap)
    except Exception:
        return ""
