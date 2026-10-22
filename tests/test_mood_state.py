"""心境状态机的离线单测（不启动服务、不需要 LLM、不需要数据库）。

运行：<venv>python tests/test_mood_state.py
也可以被 pytest 收集（函数名以 test_ 开头）。
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from py import mood_state as ms  # noqa: E402

FAILS = []


def check(name, actual, expect, tol=0.01):
    ok = (abs(actual - expect) <= tol) if isinstance(expect, (int, float)) and isinstance(actual, (int, float)) else actual == expect
    print(f"{'PASS' if ok else 'FAIL'}  {name}: actual={actual} expect={expect}")
    if not ok:
        FAILS.append(name)


def test_ceiling_table():
    for hour, expect in [(0, 55), (1, 55), (2, 20), (5, 20), (6, 85), (8, 85),
                         (9, 100), (11, 100), (12, 80), (13, 80), (14, 95), (17, 95),
                         (18, 85), (22, 85), (23, 55)]:
        check(f"ceiling_from_hour({hour})", ms.ceiling_from_hour(hour), expect)


def test_advance_v_goes_to_middle():
    # V=90，远离事件 3 小时（不在睡眠区间）→ 应向 60 回落，且明显低于 90
    st = ms.default_state()
    st["V"] = 90.0
    st["E"] = 50.0
    now = st["updated_at"] + 3 * 3600
    out = ms.advance(st, now)
    check("V 向中性回落（3h 后 < 90）", out["V"] < 90, True)
    check("V 未跌破基线（> 60）", out["V"] > 60, True)
    check("V 具体值（≈ 60 + 30*e^-1 ≈ 71.0）", round(out["V"], 1), 71.0, tol=0.5)


def test_advance_e_goes_to_ceiling():
    # E=10，3 小时后应向上限恢复（上限按当前时段）
    st = ms.default_state()
    st["E"] = 10.0
    now = st["updated_at"] + 3 * 3600
    out = ms.advance(st, now)
    cap = ms.ceiling(now)
    check("E 不超上限", out["E"] <= cap, True)
    check("E 向上升", out["E"] > 10, True)


def test_advance_t_goes_to_full():
    st = ms.default_state()
    st["T"] = 30.0
    now = st["updated_at"] + 3600  # 1 小时 = 3 个 τT
    out = ms.advance(st, now)
    check("T 向 100 恢复（>90）", out["T"] > 90, True)
    check("T 不超 100", out["T"] <= 100, True)


def test_ceiling_hard_clamp():
    # 无论怎么调，推进后 E 都不得超上限
    st = ms.default_state()
    st["E"] = 100.0
    now = st["updated_at"] + 600
    out = ms.advance(st, now)
    check("E 被上限硬钳制", out["E"] <= ms.ceiling(now), True)


def test_t_floor():
    st = ms.default_state()
    st["T"] = 25.0
    out = ms.apply_deltas(st, d_t=-100.0, now_ts=st["updated_at"] + 60)
    check("耐心地板 20", out["T"], 20.0, tol=0.6)


def test_sleep_gap():
    st = ms.default_state()
    st["V"] = 20.0
    st["E"] = 20.0
    st["T"] = 30.0
    now = st["updated_at"] + 8 * 3600      # 睡了一觉
    out = ms.advance(st, now)
    cap = ms.ceiling(now)
    check("睡醒后 E ≈ 上限*0.9", round(out["E"], 1), round(cap * 0.9, 1), tol=0.6)
    check("睡醒后 T 大幅回升（>90）", out["T"] > 90, True)
    check("睡醒后 V 回向中性（20 → 48，向 60 靠 70%）", round(out["V"], 1), 48.0, tol=0.6)


def test_clock_reversal_ignored():
    st = ms.default_state()
    st["E"] = 40.0
    out = ms.advance(st, st["updated_at"] - 3600)   # 时间往回拨
    check("时钟回拨不改变 E", round(out["E"], 1), 40.0, tol=0.6)


def test_main_axis():
    st = ms.default_state()
    st.update({"V": 60, "E": 20, "T": 60})
    check("精力低 → E_low", ms.main_axis(st), "E_low")
    st.update({"V": 30, "E": 85, "T": 60})
    check("心情低 → V_low", ms.main_axis(st), "V_low")
    st.update({"V": 60, "E": 25, "T": 30})
    check("双低 → ET_low", ms.main_axis(st), "ET_low")
    st.update({"V": 60, "E": 90, "T": 60})
    check("精神好 → 不提示（None）", ms.main_axis(st), None)
    st.update({"V": 62, "E": 58, "T": 61})
    check("全平稳 → None", ms.main_axis(st), None)


def test_turn_deltas():
    dv, de, dt = ms.estimate_turn_deltas("谢谢你，今天好开心！", "嗯，我也开心。")
    check("被夸 → dV>0", dv > 0, True)
    check("dE<0（消耗精力）", de < 0, True)

    dv2, de2, dt2 = ms.estimate_turn_deltas("滚，闭嘴，你真烦，垃圾", "……")
    check("被骂 → dV 明显为负", dv2 <= -6, True)
    check("负向幅度大于正向幅度", abs(dv2) > abs(dv), True)

    _, _, dt3 = ms.estimate_turn_deltas("帮我重构这段代码" + "很长的需求" * 200, "好的", tool_calls=3)
    check("长需求+工具 → dT<0", dt3 < 0, True)

    _, _, dt4 = ms.estimate_turn_deltas("哈哈", "嗯")
    check("轻松闲聊几乎不耗耐心", dt4 >= -3, True)

    # 单轮夹紧
    dv5, de5, dt5 = ms.estimate_turn_deltas("谢谢你" * 50, "x" * 5000, tool_calls=20)
    check("dV 在夹紧范围内", ms.LIMIT_V[0] <= dv5 <= ms.LIMIT_V[1], True)
    check("dE 在夹紧范围内", ms.LIMIT_E[0] <= de5 <= ms.LIMIT_E[1], True)
    check("dT 在夹紧范围内", ms.LIMIT_T[0] <= dt5 <= ms.LIMIT_T[1], True)


def test_recent_deltas_recorded():
    st = ms.default_state()
    out = ms.apply_deltas(st, d_v=3, d_e=-4, d_t=-2, reason="测试", now_ts=st["updated_at"] + 10)
    check("记录了一条变更", len(out["recent_deltas"]), 1)
    check("变更带原因", out["recent_deltas"][0]["reason"], "测试")


def main():
    for fn in [test_ceiling_table, test_advance_v_goes_to_middle, test_advance_e_goes_to_ceiling,
               test_advance_t_goes_to_full, test_ceiling_hard_clamp, test_t_floor, test_sleep_gap,
               test_clock_reversal_ignored, test_main_axis, test_turn_deltas, test_recent_deltas_recorded]:
        print(f"\n--- {fn.__name__} ---")
        fn()
    print("\n" + "=" * 60)
    print("全部通过" if not FAILS else f"失败 {len(FAILS)} 项: {FAILS}")
    return 0 if not FAILS else 1


if __name__ == '__main__':
    sys.exit(main())
