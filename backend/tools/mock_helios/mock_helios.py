"""Mock HELIOS++：在无 HELIOS++ 的机器上跑通 FeHALS 全链路。

读取 survey XML 中的航迹（.trj）与扫描角，沿航迹按扫描顺序生成 XYZ 点云
（外层沿轨、内层垂轨，与真实旋转扫描器的出点顺序一致），打印带百分比的
进度行（后端据此解析进度），退出码 0。仅用于演示与联调，非真实物理仿真。
"""
import math
import random
import re
import sys
import time
from pathlib import Path


def parse_args(argv):
    survey = argv[1] if len(argv) > 1 else None
    out_dir = None
    for i, a in enumerate(argv):
        if a == "--output" and i + 1 < len(argv):
            out_dir = Path(argv[i + 1])
    return survey, out_dir


def load_trajectory(path):
    pts = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        c = line.split(",")
        if len(c) >= 7:
            pts.append((float(c[4]), float(c[5]), float(c[6])))
    return pts


def terrain_z(x, y, rng):
    return 3.0 * math.sin(x / 40.0) * math.cos(y / 35.0) + 1.2 * math.sin(y / 12.0) + rng.uniform(-0.15, 0.15)


def main(argv):
    survey, out_dir = parse_args(argv)
    if not survey or not out_dir:
        print("[MockHelios] usage: helios++ <survey.xml> --output <dir>", flush=True)
        return 2
    xml = Path(survey).read_text(encoding="utf-8")
    m = re.search(r'trajectory="([^"]+)"', xml)
    if not m:
        print("[MockHelios] survey XML 中未找到 trajectory", flush=True)
        return 2
    traj_pts = load_trajectory(m.group(1))
    if len(traj_pts) < 2:
        print("[MockHelios] 航迹点数不足", flush=True)
        return 2
    ma = re.search(r'scanAngle_deg="([0-9.]+)"', xml)
    half = math.radians((float(ma.group(1)) / 2.0) if ma else 30.0)
    alt = traj_pts[0][2] or 100.0
    swath = max(1.0, alt * math.tan(half))

    print(f"[MockHelios] 读取航迹 {len(traj_pts)} 点，航高 {alt:.1f} m，幅宽半宽 {swath:.1f} m", flush=True)

    # 沿航迹等弧长采样
    cum = [0.0]
    for i in range(1, len(traj_pts)):
        cum.append(cum[-1] + math.dist(traj_pts[i - 1], traj_pts[i]))
    total_len = cum[-1] or 1.0
    SAMPLES, PER = 240, 260
    rng = random.Random(42)

    out_file = out_dir / "mock_survey" / f"scan_{int(time.time())}.xyz"
    out_file.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with out_file.open("w", encoding="utf-8") as f:
        for s in range(SAMPLES):
            d = total_len * s / (SAMPLES - 1)
            k = 1
            while k < len(cum) - 1 and cum[k] < d:
                k += 1
            seg = cum[k] - cum[k - 1]
            t = (d - cum[k - 1]) / seg if seg > 1e-9 else 0.0
            ax, ay, az = traj_pts[k - 1]
            bx, by, bz = traj_pts[k]
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            dx, dy = bx - ax, by - ay
            L = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / L, dx / L  # 垂轨方向
            for j in range(PER):
                u = (j / (PER - 1) - 0.5) * 2.0 * swath
                x = px + nx * u + rng.uniform(-0.05, 0.05)
                y = py + ny * u + rng.uniform(-0.05, 0.05)
                z = terrain_z(x, y, rng)
                inten = 20.0 + 60.0 * abs(math.sin(j * 0.7 + s * 0.13))
                f.write(f"{x:.4f} {y:.4f} {z:.4f} {inten:.2f} 0.0 1 1 0\n")
                written += 1
            if s % 24 == 0:
                pct = 100.0 * s / (SAMPLES - 1)
                print(f"[MockHelios] Survey {pct:.2f}% ({written} points)", flush=True)
                time.sleep(0.18)
    print(f"[MockHelios] Survey 100.00% ({written} points)", flush=True)
    print(f"[MockHelios] 输出: {out_file}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))