"""生成 HELIOS++ 兼容的航迹文件（.trj）。

HELIOS++ 原生航迹为 CSV 格式，列顺序为：
    t, roll, pitch, yaw, x, y, z
（参见 helios-demo/data/trajectories/flyandrotate.trj）
survey XML 中通过 tIndex/xIndex/yIndex/zIndex/rollIndex/pitchIndex/yawIndex 映射列。

偏航角（yaw）根据航向计算：
  - HELIOS++ 使用 ARINC 705 规范，yaw=0 表示 +y 方向（北），顺时针增加
  - yaw=90 表示 +x 方向（东），yaw=-90（或 270）表示 -x 方向（西）
  - 若不设置正确的 yaw，扫描器将沿错误方向扫描（沿轨而非正交），导致点云形状异常
"""
import math
import time
from typing import List

from app.config import TRAJECTORIES_DIR


def _compute_yaw(x1: float, y1: float, x2: float, y2: float) -> float:
    """计算从点 (x1,y1) 到点 (x2,y2) 的偏航角（度）。

    atan2(dx, dy)：+y 方向为 0°，+x 方向为 90°，返回 [-180, 180]。
    """
    dx = x2 - x1
    dy = y2 - y1
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 0.0
    return math.degrees(math.atan2(dx, dy))


def generate(waypoints: List[List[float]], altitude: float = 100.0) -> dict:
    """将航点列表写入原生 .trj 文件。

    飞行高度为恒定值：所有航点的高程统一为 altitude，
    仅用航点的 x、y 定义水平飞行路径（ALS 常规做法）。
    偏航角由相邻航点间的方向向量实时计算，确保扫描器始终正交于航线。

    每段航线的两端点 yaw 相同（指向该段方向），
    方向变化处通过同一时间戳的重复行实现瞬时转向（同 flyandrotate.trj 做法）。
    返回 dict：{file_id, path, point_count}
    """
    file_id = f"traj_{int(time.time() * 1000)}"
    path = TRAJECTORIES_DIR / f"{file_id}.trj"

    lines = [
        "#TIME_COLUMN: 0",
        '#HEADER: "t", "roll", "pitch", "yaw", "x", "y", "z"',
    ]

    n = len(waypoints)
    if n == 1:
        # 单个航点，yaw 无意义，设为 0
        x, y = float(waypoints[0][0]), float(waypoints[0][1])
        lines.append(f"0,0,0,0.00,{x:.6f},{y:.6f},{altitude:.6f}")
    else:
        for i in range(n - 1):
            x, y = float(waypoints[i][0]), float(waypoints[i][1])
            next_x, next_y = float(waypoints[i + 1][0]), float(waypoints[i + 1][1])
            yaw = _compute_yaw(x, y, next_x, next_y)

            if i > 0:
                # 中间航点：先写上一段方向的结束行，再写本段方向的起始行
                # 两行在同一时间戳，实现瞬时转向
                prev_x, prev_y = float(waypoints[i - 1][0]), float(waypoints[i - 1][1])
                incoming_yaw = _compute_yaw(prev_x, prev_y, x, y)
                lines.append(f"{i},0,0,{incoming_yaw:.2f},{x:.6f},{y:.6f},{altitude:.6f}")

            lines.append(f"{i},0,0,{yaw:.2f},{x:.6f},{y:.6f},{altitude:.6f}")

        # 最后一个航点：沿用上一段的方向
        x, y = float(waypoints[-1][0]), float(waypoints[-1][1])
        prev_x, prev_y = float(waypoints[-2][0]), float(waypoints[-2][1])
        yaw = _compute_yaw(prev_x, prev_y, x, y)
        lines.append(f"{n - 1},0,0,{yaw:.2f},{x:.6f},{y:.6f},{altitude:.6f}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"file_id": file_id, "path": str(path), "point_count": n}