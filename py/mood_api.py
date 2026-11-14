"""心境系统 HTTP 接口。

- GET  /api/mood/state   取当前快照（真实数值，给 UI 用；不进 prompt）
- POST /api/mood/set     手动设值（拖动）并冻结自动写入
- POST /api/mood/reset   重置为基线
- GET  /api/mood/config  取心境相关配置（节拍/上限表/当前上限）
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel

from py.get_setting import load_settings
from py.mood_clock import mood_clock
from py import mood_state as ms

router = APIRouter(prefix="/api/mood", tags=["Mood System"])


MAX_FREEZE_MINUTES = 24 * 60      # 冻结上限 24 小时（审核员 P2-5 建议：超过一天没有意义）


class MoodSetRequest(BaseModel):
    V: Optional[float] = None
    E: Optional[float] = None
    T: Optional[float] = None
    freezeMinutes: Optional[int] = None


@router.get("/state")
async def get_mood_state_api():
    try:
        settings = await load_settings()
        snap = mood_clock.snapshot(settings)
        snap["enabled"] = bool((settings.get("moodSettings", {}) or {}).get("enabled"))
        return {"success": True, "data": snap}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/config")
async def get_mood_config_api():
    try:
        settings = await load_settings()
        cfg = dict((settings.get("moodSettings", {}) or {}))
        cfg.setdefault("tickMinutes", 5)
        cfg.setdefault("allowLapse", False)
        cfg.setdefault("manualLockMinutes", 30)
        cfg.setdefault("baseline", dict(ms.DEFAULT_BASELINE))
        return {
            "success": True,
            "data": {
                "settings": cfg,
                "ceilingTable": ms.CEILING_TABLE,
                "ceiling": ms.ceiling(),
                "tFloor": ms.T_FLOOR,
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/set")
async def set_mood_api(req: MoodSetRequest):
    try:
        settings = await load_settings()
        if not (settings.get("moodSettings", {}) or {}).get("enabled"):
            # 开关关闭时不做任何写入（审核员 P3：关掉后仍落盘会留下"幽灵状态"）
            return {"success": False, "error": "心境系统未开启"}
        freeze = req.freezeMinutes
        if freeze is not None:
            freeze = max(0, min(int(freeze), MAX_FREEZE_MINUTES))
        snap = await mood_clock.set_manual(
            settings, v=req.V, e=req.E, t=req.T, freeze_minutes=freeze)
        return {"success": True, "data": snap}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/reset")
async def reset_mood_api():
    try:
        settings = await load_settings()
        if not (settings.get("moodSettings", {}) or {}).get("enabled"):
            return {"success": False, "error" : "心境系统未开启"}
        snap = await mood_clock.reset(settings)
        return {"success": True, "data": snap}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/tick")
async def manual_tick_api(payload: Dict[str, Any] = Body(default={})):
    """调试用：手动推进一次（默认按当前时间）。"""
    try:
        settings = await load_settings()
        snap = await mood_clock.tick(settings)
        return {"success": True, "data": snap}
    except Exception as e:
        return {"success": False, "error": str(e)}
