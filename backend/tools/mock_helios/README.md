# mock_helios — HELIOS++ 模拟引擎

在未安装 HELIOS++ 的机器上跑通 FeHALS 全链路（航迹/配置生成 → 子进程执行 →
WebSocket 进度 → 点云解析 → 仿真动画回放），供联调、演示与前端开发使用。

它遵循后端对 `HELIOS_PATH` 的调用契约：读取 survey XML 中的航迹（.trj）与
扫描角，沿航迹按扫描顺序生成 XYZ 点云，stdout 打印带百分比的进度行
（后端据此解析进度），退出码 0。

## 用法

Windows（PowerShell）：

```powershell
$env:HELIOS_PATH = "<repo>\backend\tools\mock_helios\helios++.bat"
cd backend; python run.py
```

Windows（cmd）：

```bat
set HELIOS_PATH=<repo>\backend\tools\mock_helios\helios++.bat
cd backend && python run.py
```

Linux / macOS：将 `HELIOS_PATH` 指向自行包装的 shell 脚本
（内容等价于 `python mock_helios.py "$@"`）即可。

## 说明

- 点云为合成地形（正弦起伏 + 噪声），规模 240 个扫描位置 × 260 点/线；
  写出顺序为外层沿轨、内层垂轨，与真实旋转扫描器的出点顺序一致，
  因此前端「仿真动画」可按扫描顺序正确回放点云生成过程。
- 仅用于联调与演示，非物理仿真；正式结果请将 `HELIOS_PATH` 指向真实 helios++。