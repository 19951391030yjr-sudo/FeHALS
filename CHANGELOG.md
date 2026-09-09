# Changelog

## Unreleased

### Added
- 仿真过程动画：平台代理（UAV 四旋翼 / Airborne 固定翼，旋翼自转、机头朝向航段方向）沿规划航迹恒高飞行，配扫描面扇面、横航足迹线与摆动扫描线示意（线扫描器：地面投影为线段）；点云按 HELIOS++ 出点顺序逐步生成（仅改写 geometry.drawRange，零缓冲重建），支持「逐点连续 / 逐条带（按航段）」两种揭示方式
- 「动画」Tab：播放/暂停/从头播放/停止、倍速（0.5~8×）、循环、仿真完成后自动播放、显示开关（平台/扫描面扇面/足迹线/航迹/视角跟随）、平台示意大小倍率、航迹与进度统计（长度/航段/时长/航高/幅宽/已生成点数）
- 场景底部播放条：播放/暂停、重播、进度拖动、时间/百分比、倍速、已生成点数；按场景宽度（容器查询）逐级隐藏次要读数，保证单行不溢出
- useThreeScene 新增帧回调机制（onFrame/offFrame，共用渲染循环）、动画对象组 animGroup、点云揭示 API（revealPointCloud/getPointCloudCount），并暴露 controls 供视角跟随
- HELIOS++ 运行环境检测与诊断：后端 `GET /api/env/diagnose` 接口检测可执行文件存在性/可执行权限/版本探测、资源目录完整性（HELIOS_REPO 子目录、pyhelios 平台/扫描器定义、--assets 搜索路径）、静态工作目录就绪状态；前端设置面板新增「环境诊断」区块，显示整体状态徽章、各检测项明细（含状态图标、路径、错误提示），支持「重新检测」按钮
- 点云特征统计：结果接口返回全量点统计（点数/平均高度/高度标准差/高度范围，基于降采样前的完整点集），点云 Tab 新增「特征统计」区块（含 XYZ 范围显示）
- 高度分位数统计（中位数、P5、P95）与强度统计（均值/标准差/范围）
- 高度分布直方图：服务端基于全量点 40 分箱计算，前端 SVG 渲染，配色与 3D 高度着色一致，悬停显示分箱区间与点数
- 航高自动计算：基于场景模型最高点 + 安全余量（20 m）推荐安全飞行高度，并受飞行器「准许最大飞行高度」约束（ControlPanel「建议航高」按钮 + useThreeScene.getSceneMaxZ；上限 = min(平台参数上限, 扫描器最大测程 rangeMax)）
- 传感器参数新增「最大测程」只读显示，数据源为 HELIOS++ scanner 定义（riegl_vux-1uav 未声明 rangeMax_m，故无上限）

### Changed
- XYZ 点云解析改为逐行流式读取，避免大点云文件整体载入内存
- 高度着色渐变抽取为共用模块 colorRamp.js（3D 点云着色与统计直方图共用）

### Fixed
- Windows 下仿真子进程无法启动：uvicorn 的 reload 模式在 Windows 会将事件循环切到 Selector 策略，`asyncio.create_subprocess_exec` 在该策略下抛 NotImplementedError；helios_service 改为在独立线程中以同步 subprocess.Popen 拉起引擎并逐行桥接日志/进度，Selector/Proactor 与 Linux/Windows 均适用（取消、超时、进度解析与日志分级行为不变）
- 结果接口响应补充 stats 字段，修复前端统计面板无数据
- 页面加载时拉取后端已注册模型，修复刷新后模型列表为空
- 修复航高自动计算在增删模型后仍显示上一次结果的 bug：模型列表变化时清空建议航高
- 修复删除模型后 `modelRoots` 未真正清除、航高仍计入已删模型的 bug（`delete` 语句后紧跟 `[` 数组字面量触发 JS ASI 陷阱，改为前导分号 `;[...].forEach`）

## v0.1.0 (2026-09-01)

### Added
- 参数规格库（scannerSpecs.js）：扫描器/平台参数有效范围、默认值、步长
- 仿真参数 Tab 分为「载体参数」与「传感器参数」两个模块，显示各参数有效范围
- 执行仿真前参数校验，超出范围拒绝执行并提示
- 平台切换自动重置参数至默认值
- 扫描器/平台只读参数显示（光束发散角、最小测程）
- 场景中模型 bbox 显示尺寸精灵
- 设置 Tab（缓存统计 + 清理）
- 航迹管理 Tab（航迹列表 + 弓字形面板）
- SUMMERY.md 中文开发日志
- CHANGELOG.md 变更记录
- .github/CODEOWNERS 保护云端repo

### Changed
- 扫描器选型：Airborne -> `copter_linearpath` + `riegl_vux-1uav`（含 beamOrigin/headRotateAxis，扫描方向正确为垂轨）
- 移除 survey XML 的 `rotationSpec="CANONICAL"` 与 scannerMount 覆盖，使用平台默认安装
- 侧边栏 Tab：「点云渲染」->「点云」，点云下载整合至 Tab 内
- 模型列表删除 bbox 全选按钮
- 仿真参数输入改为纵向布局（标签在上、输入框居中、有效范围在输入框下方）

### Fixed
- 模型删除后列表仍显示（loadedIds 未同步移除）
- 扫描方向为沿轨而非垂轨（改用 copter_linearpath + riegl_vux-1uav）

### Removed
- `helios-demo/` 目录

## v0.1.0 (2026-09-01)

### Added
- 3D 场景渲染（Three.js，Z-up 坐标系，网格地面，OrbitControls）
- 模型上传与加载（OBJ/GLTF/STL，自动适配视图，Y-up 自动旋转）
- 交互式航点编辑（鼠标点击添加、航点贴地 z=0、自绘拖拽锁相机、Delete/右键删除）
- 白色折线连接航点形成航线
- 航迹导出（HELIOS++ 原生 .trj CSV，恒定飞行高度）
- 仿真参数配置面板（平台类型/飞行速度/航高/扫描频率/角度/脉冲频率/输出格式）
- 弓字形自动航迹生成（矩形区域点两点生成，间距可配）
- HELIOS++ 仿真集成（asyncio 子进程调用，实时日志捕获，进度百分比，WebSocket 推送）
- 点云渲染（Points 着色：按高度/强度/固定颜色，尺寸与透明度滑块）
- 仿真取消（后端 cancel + 前端取消按钮）
- 点云下载（仿真完成后下载 LAS/LAZ/XYZ）
- 日志控制台（分级日志 INFO/WARNING/ERROR，自动滚动，清空）
- 可拖拽布局（侧边栏宽度/控制台高度手柄）
- 模型列表 Tab（可见性切换、移除、bbox 线框 + 尺寸文本）
- 点云渲染 Tab（尺寸/透明度/着色/颜色，移出场景浮层）
- 航迹管理 Tab（航点列表 + 弓字形面板）
- 设置 Tab（缓存目录大小统计 + 清理）
- 航高校验（UAV 最小测程 3m，Airborne 最小测程 100m，不足时警告 + 拒绝执行）
- 模型 up 轴自动检测（Y-up 模型在 Three.js 与 HELIOS++ 中一致旋转到 Z-up）
- 项目文档（doc/Manuscript.tex，Elsevier CAS 模板，中文）

### Changed
- 扫描器选型：Airborne 使用 `leica_als50-ii`（具 `rotationSpec="CANONICAL"` + scannerMount，扫描方向正确为垂轨）
- 侧边栏改为多 Tab 布局（5 个：仿真参数 / 点云渲染 / 模型列表 / 航迹 / 设置）
- Three.js 场景从 Y-up 改为 Z-up（与 HELIOS++ 坐标一致）
- 移除 DragControls，改为自绘拖拽（锁相机 + 航点贴地）
- 点云渲染控件从场景浮层移入侧边栏 Tab
- 移除 Terrestrial/TLS 平台选项
- 移除 `helios-demo/` 目录

### Fixed
- 仿真进度百分比恒为 0（正则无法匹配小数点格式 `50.00%`）
- 航点拖拽时相机视角跟随转动（自绘拖拽锁定相机）
- 航点高程未按恒定飞行高度（所有航点统一为 altitude）
- 模型 Y/Z 轴指向不一致（Three.js 与 HELIOS++ 的 up 轴旋转对齐）
- 扫描方向为沿轨而非垂轨（改用 `leica_als50-ii` + scannerMount）

### Known Issues
- LAS/LAZ 输出不可用：本机 helios++ 构建的 LAS 输出崩溃（`LASwriter` 空指针），默认使用 XYZ 输出
- Airborne 扫描器最小测程 100m，低空扫描请使用 UAV 平台