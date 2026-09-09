# FeHALS

**Frontend of HELIOS++ for Airborne Laser Scanning**

基于 Web 的 3D 可视化航路规划与激光仿真系统。用户通过浏览器加载三维模型，交互式设计航点与航线，配置仿真参数，调用 HELIOS++ 引擎执行激光扫描仿真，并可视化仿真生成的点云结果。

## 架构

浏览器/服务器（B/S）架构，三层：

- **前端**：Vue 3 + Three.js，负责三维场景渲染、交互式航点编辑、参数配置、点云渲染与仿真过程动画回放。
- **后端**：FastAPI + Python，负责航迹/XML 配置生成、调用 HELIOS++ 引擎、解析点云结果，并通过 WebSocket 推送日志。
- **仿真引擎**：HELIOS++（`helios++`），由后端以子进程方式调用。

## 核心功能

- **3D 场景**：Three.js 渲染，自适应视口网格（网格尺寸与划分跟随相机远近与朝向），鼠标拖拽/滚轮漫游
- **模型管理**：OBJ/GLTF/GLB/STL 模型上传（单选/批量），场景内实时预览
- **航点编辑**：场景内点击布设航点，支持弓字形航线自动生成（矩形区域两点定义）
- **仿真参数**：平台与扫描器**独立选择**，参数范围自动校验，每类平台/扫描器有独立的默认值与约束
- **仿真执行**：调用 HELIOS++ 引擎，WebSocket 实时推送日志与进度
- **点云结果**：3D 点云渲染，覆盖度热力图分析（XY 投影密度网格）
- **环境诊断**：一键检测 HELIOS++ 可执行文件、资源目录、静态工作目录完整性
- **缓存管理**：模型/航迹/配置/结果清理

## 目录结构

```
FeHALS/
├── backend/            # FastAPI 后端
│   ├── app/
│   │   ├── main.py     # 应用入口（WebSocket 日志）
│   │   ├── config.py   # 全局配置（HELIOS++ 路径等）
│   │   ├── api/        # REST 路由 + WebSocket
│   │   ├── models/     # Pydantic schema
│   │   ├── services/   # 航迹/配置生成、HELIOS++ 调用、点云解析、覆盖度分析
│   │   └── static/     # 上传模型 / 航迹 / 配置 / 结果
│   ├── requirements.txt
│   └── run.py
├── frontend/           # Vue 3 + Three.js 前端
│   └── src/
│       ├── components/ # Scene3D / ControlPanel / WaypointList / LogConsole /
│       │               # PointCloudPanel / ModelList / SettingsPanel / CoverageHeatmap
│       ├── stores/     # Pinia 状态（仿真/航点/场景）
│       ├── composables/# Three.js 场景 / 航点交互 / API 客户端 / 弓字形生成 /
│       │               # 扫描器规格 / 弓字航迹 / WebSocket 日志
│       └── assets/
└── doc/               # 项目文档（LaTeX，Elsevier CAS）
    ├── Manuscript.tex
    └── Makefile        # cd doc && make
```

## 快速开始

### 后端

```bash
conda create -n FeHALS python=3.10 -y
conda activate FeHALS
cd backend
pip install -r requirements.txt
python run.py           # http://localhost:8000（接口文档 /docs）
```

### 前端

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173（/api、/ws 代理到 8000）
```

### 项目文档

```bash
cd doc
make                    # 生成 build/Manuscript.pdf
```

## HELIOS++ 集成

后端通过环境变量配置 HELIOS++ 路径与资源目录（均有默认值）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HELIOS_PATH` | `helios++` | HELIOS++ 可执行文件 |
| `HELIOS_REPO` | `/home/azusa/file/project/3rd/helios` | HELIOS++ 源仓库根目录 |
| `HELIOS_ASSETS` | 仓库根 + `python/pyhelios` | `--assets` 搜索路径（平台/扫描器目录与示例资源） |

仿真调用形式：`helios++ <survey.xml> --assets <dir...> --output <dir> [--lasOutput] [--zipOutput]`。

仅 OBJ 格式模型可参与 HELIOS++ 仿真；GLTF/STL 支持前端三维展示。

> **关于输出格式**：本机 `helios++`（Helios v2.0.1）构建的 LAS/LAZ 输出不可用（`LASopen` 返回空指针导致崩溃），因此系统**默认使用 XYZ 输出**。如需 LAS/LAZ，请重新编译 HELIOS++ 并确保正确链接 LASlib 后，在前端「输出格式」中选择 LAS/LAZ。

> **关于平台与扫描器**：系统暴露真实的 HELIOS++ 平台 ID 与扫描器 ID，支持独立选择。平台与扫描器完全解耦，任意组合均受支持。平台决定载体参数（速度/高度范围），扫描器决定传感器参数（扫描频率/角度/脉冲频率范围）。部分参数（如 risley 棱镜式扫描器的 scan_freq/scan_angle）自动标记为只读，UI 以说明文字替代输入框。
>
> **当前支持的 Platform（7 种）：**
> | 平台 | 类型 | 速度范围 | 高度范围 | 说明 |
> |------|------|----------|----------|------|
> | `copter_linearpath` | linearpath | 0.5–50 m/s | 3–500 m | 四旋翼无人机（运动学） |
> | `sr22` | linearpath | 20–200 m/s | 200–5000 m | Cirrus SR-22 固定翼 |
> | `quadcopter` | multicopter | 0.5–30 m/s | 3–500 m | 四旋翼（物理模型） |
> | `vehicle_linearpath` | linearpath | 0.5–30 m/s | 0.5–5 m | 地面车载 |
> | `simple_linearpath` | linearpath | 0.1–100 m/s | 0.1–5000 m | 通用线性路径 |
> | `tripod` | static | — | 0.5–10 m | TLS 三脚架 |
> | `tripod_down` | static | — | 0.5–10 m | TLS 三脚架朝下 |
>
> **当前支持的 Scanner（11 种）：**
> | 扫描器 | 文件 | 光学 | 扫描频率 | 扫描角度 | 脉冲频率 |
> |--------|------|------|----------|----------|----------|
> | RIEGL VUX-1UAV | scanners_als.xml | rotating | 10–200 Hz | ±1–165° | 50–550 kHz |
> | RIEGL VQ 780i | scanners_als.xml | rotating | 20–300 Hz | ±1–30° | 150–1000 kHz |
> | RIEGL VQ-1560i | scanners_als.xml | rotating (dual) | 40–600 Hz | ±1–30° | 150–2000 kHz |
> | Leica ALS50 | scanners_als.xml | oscillating | 25–70 Hz | ±1–37.5° | 83 kHz (固定) |
> | RIEGL LMS-Q780 | scanners_als.xml | rotating | 10–200 Hz | ±1–30° | 100–400 kHz |
> | Optech Galaxy | scanners_als.xml | oscillating | 0–120 Hz | ±1–30° | 35–550 kHz |
> | DJI Zenmuse L2 (rep.) | scanners_als.xml | risley | (棱镜式) | (棱镜式) | 40 kHz (固定) |
> | Velodyne VLP-16 | scanners_tls.xml | rotating (16ch) | (转头转速) | (多通道) | 18.75 kHz (固定) |
> | Velodyne HDL-64E | scanners_tls.xml | rotating (64ch) | (转头转速) | (64通道) | 20.833 kHz (固定) |
> | RIEGL VZ-400 | scanners_tls.xml | rotating | 3–120 Hz | ±1–50° | 100–300 kHz |
> | Livox Avia (non-rep.) | scanners_tls.xml | risley | (棱镜式) | (棱镜式) | 40 kHz (固定) |
>
> **关于航高**：系统会把**所有航点统一抬升到设定的「飞行高度」**（恒定航高），仅用航点的水平位置（x、y）规划航线。「自动计算航高」功能基于场景模型最高点 + 安全余量（20m）推荐航高，受平台高度上限与扫描器最大测程双重约束。

## 文档

- [项目设计书](doc/src/DESIGNBOOK.tex)
- [FeHALS 文档](doc/src/DOCUMENT.tex)
- [CODEOWNER 个人总结](doc/src/DESCRIPTION.tex)
