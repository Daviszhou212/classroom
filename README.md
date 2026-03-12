[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](./README.md)
[![English](https://img.shields.io/badge/Language-English-blue)](./README.en.md)

# 班级电子宠物管理系统（离线 MVP）

## 运行方式
- 方式一：直接双击打开 `index.html`。
- 方式二：本地启动静态服务器（仍离线），例如：
  - `python -m http.server`
  - 或使用任意本地静态服务器工具

## 功能概览
- 教师模式：学生管理、加分奖励、喂养、导入导出、展示模式入口、系统设置。
- 学生展示：查看宠物与积分（仅展示）。
- 展示模式：课堂投影轮播/翻页展示。
  - 现为多卡片分页展示（上一页/下一页）。
- 教师登录支持恢复码重设 PIN：
  - 未登录时可在教师入口点击 `重新设置 PIN`
  - 输入管理员提供的恢复码后，可直接重设新的教师 PIN
  - 如果本地 `teacherPinHash` 配置损坏，系统会提示使用恢复流程修复

## 数据与存储
- 数据保存在本机浏览器 LocalStorage。
- 支持导出/导入 JSON 备份恢复。
- 支持导入学生名单 CSV（格式：`studentNo,name,group,alias`，其中 alias 为拼音/英文名，可选）。示例文件：`data-samples/students.csv`。
- 导入 JSON 时会校验教师 PIN 配置；无效的 `teacherPinHash` 会被拒绝导入。

## 约束与设定
- 完全离线运行，不依赖外网资源。
- 不启用扣分功能。
- 喂养仅教师代操作。

## 使用提示
1. 首次进入教师模式需要设置教师 PIN。
2. 添加学生后会自动生成对应宠物档案。
3. 展示模式支持分页翻页查看所有宠物。
4. 如果忘记教师 PIN，或系统提示教师 PIN 配置损坏，可在教师登录页点击 `重新设置 PIN`，使用恢复码重新设置后直接进入教师模式。

## 素材来源与授权
- 宠物图标来自 Twemoji（CC BY 4.0），已下载并本地化存放于 `assets/pets/`。
- 项目主页：https://github.com/jdecked/twemoji
- 授权协议：https://creativecommons.org/licenses/by/4.0/
