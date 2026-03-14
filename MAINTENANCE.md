# MAINTENANCE

## 1. 项目概览
- 项目名称：班级电子宠物管理系统（离线 MVP）。
- 运行形态：纯前端静态页面，无后端服务、无构建步骤。
- 核心模式：
  - 教师模式：学生管理、加分、班会喂养入口、导入导出、系统设置。
  - 学生展示：仅查看宠物与积分。
  - 班会喂养模式：老师开启后，学生轮流自选自己；首次有效喂养前可使用 1 次重新领养机会，之后可先兑换食物到个人背包，再连续喂养或跳过。
  - 展示模式：分页展示学生宠物，支持搜索与翻页，只读；仅从主页进入，退出后返回主页。
- 数据机制：
  - 业务数据存储在浏览器 `LocalStorage`（键名：`class-pet-mvp`）。
  - 支持导出/导入 JSON 备份。
  - 教师加分会同步写入 `awardBatches`，按批次分组展示，但真正撤销粒度为批内单条加分记录。
  - 教师模式中的反馈建议保存在 `meta.feedbackEntries`，会进入 JSON 备份。
  - 提交反馈时会优先尝试同步追加到本地 `JSONL` 文件；不支持文件句柄能力时自动退化为下载单条 `JSONL` 文件。
  - 支持导入 CSV 学生名单（示例见 `data-samples/students.csv`）。
- 业务约束：
  - 不启用扣分功能（仅加分）。
  - 展示模式只读，不允许喂养或积分变更。
  - 喂养仅通过班会喂养模式进行，不保留教师代喂入口。
  - 教师模式内不提供主页/展示模式出口；离开教师态只能显式退出。
  - 班会喂养会话需由老师手动结束。

## 2. 技术栈与运行依赖
- 技术栈：
  - `index.html` + `styles/main.css` + `scripts/app/*.js` + `scripts/app.js`（Vanilla JS，多脚本串行加载）。
- 浏览器能力依赖（来自 `scripts/app/*.js` 与 `scripts/app.js`）：
  - `localStorage`、`sessionStorage`
  - `FileReader`、`Blob`、`URL.createObjectURL`
  - `showSaveFilePicker` / `FileSystemFileHandle`（仅用于支持环境下的反馈持续写文件）
  - `TextEncoder`、`crypto.subtle`（PIN 哈希；不可用时走 `legacy` 兜底）
- 本地启动依赖：
  - 可直接打开 `index.html`。
  - 或使用本地静态服务器，例如 `python -m http.server`。
- 样式相关：
  - `styles/main.css` 顶部存在 `@import url('https://fonts.googleapis.com/...')`。
  - 同时定义了本地字体回退（如 `"Microsoft YaHei"`、`"PingFang SC"`）。

## 3. 目录与关键入口
- `index.html`：页面入口，加载 `styles/main.css`、`scripts/vendor/pinyin-pro.js`、`scripts/app/*.js` 与 `scripts/app.js`。
- `scripts/app/`：核心业务逻辑拆分目录（状态、数据模型、渲染、业务动作、事件绑定）。
- `scripts/app.js`：薄入口，仅负责调用 `ClassroomPetApp.init()`。
- `styles/main.css`：全部界面样式与响应式规则。
- `data-samples/students.csv`：CSV 导入模板。
- `assets/pet.svg`：品牌图标资源。
- `assets/pets/<type>/*.png`：运行时宠物图片资源；每种宠物 4 张变体。
- `README.md`：运行方式、功能概览、数据与约束说明。

## 4. 本地启动与停止
- 启动方式 A（README 指定）：
  1. 进入 `ClassroomPet` 目录。
  2. 直接打开 `index.html`。
- 启动方式 B（README 指定）：
  1. 在 `ClassroomPet` 目录执行 `python -m http.server`。
  2. 按终端提示地址在浏览器访问页面。
- 停止方式：
  - 方式 A：关闭页面标签或浏览器窗口。
  - 方式 B：结束静态服务器进程（终止执行 `python -m http.server` 的终端会话）。

## 5. 配置与环境变量
- 环境变量：
  - 在 `README.md`、`index.html`、`scripts/app.js`、`styles/main.css` 未发现环境变量读取逻辑（如 `process.env`、`import.meta.env`）。
- 代码内置配置（`scripts/app.js`）：
  - `STORAGE_KEY = "class-pet-mvp"`：本地存储键。
  - `DEFAULT_DATA.schemaVersion = 8`：数据结构版本。
  - `AWARD_REVOCATION_WINDOW = 7 * 24 * 60 * 60 * 1000`：固定 7 天加分撤销窗口。
  - `DEFAULT_DATA.config.rules`：
    - `xpPerLevel: 50`
    - `defaultHunger: 60`
    - `defaultMood: 60`
  - `DEFAULT_DATA.config.teacherPinHash`：教师 PIN 哈希存储位。
  - `app.ui.displayPageSize = 16`：展示模式默认分页大小。
  - `app.ui.supervisedFeedSessionActive / supervisedFeedStudentId / supervisedFeedVisitedStudentIds / supervisedFeedReAdoptDraftTypeId`：班会喂养会话与重新领养草稿状态。
- 维护建议：
  - 调整默认配置前先执行 JSON 导出备份，避免历史数据与新默认值混淆。

## 6. 核心维护流程
- 初始化与鉴权流程：
  1. `init()` 执行 `loadData()`、`syncData()`、`bindEvents()`、`render()`。
  2. 教师鉴权状态通过 `sessionStorage.teacherAuthed` 维护。
  3. 首次无 PIN 时进入设置 PIN 流程；后续使用 PIN 登录。
- 学生与宠物维护流程：
  1. 教师在“学生管理”新增/编辑学生（`save-student`）。
  2. 新增学生时自动从 8 种宠物类型（`rabbit / panda / raccoon / capybara / cat / turtle / dog / bird`）中随机创建宠物档案，并默认附带 1 次重新领养机会；`syncData()` 保证学生与宠物一一对应，并补齐旧数据字段。
  3. 加载或导入旧数据时，若发现 `hamster` / `fish` 或其他无效 `petType`，会自动随机迁移到 8 种现行宠物之一。
  4. 删除学生时会清理宠物档案，但保留历史流水与加分批次，便于后续显示“对象已删除”状态和保留审计痕迹。
- 积分与喂养流程：
  1. 教师在“学生管理”中通过加分批次增加积分，并同时写入 `ledger` 与 `awardBatches`。
  2. 班会喂养中先通过 `buy_food` 扣积分并把食物加入学生个人库存，再通过 `feed` 从库存消耗 1 份食物，改饥饿/心情/XP，并按规则更新等级。
  3. 学生食物库存保存在 `students[*].foodInventory`，未使用完会跨回合保留。
  4. 全流程落地到 `ledger` 便于追溯。
  5. 未撤销的加分批次会继续显示在列表中，但实际撤销按批内单条执行；若某一条学生已删除、已过期或当前积分不足，只阻塞该条，不影响同批其他条目。
  6. 班会喂养通过 `supervised-feed-view` 组织学生轮流自选自己；学生在首次有效喂养前可执行 1 次 `re_adopt` 更换宠物类型，不影响等级、XP、饥饿值、心情值与积分。
  7. 仅兑换食物不会消耗重新领养资格；首次真实喂养后资格立即失效；结束会话后清空运行时状态，但不清空库存。
- 数据备份/恢复流程：
  1. 在“导入导出”执行“导出 JSON”（文件名形如 `class-pet-backup-YYYYMMDD.json`）。
  2. 执行“导入数据”时先校验 `schemaVersion/students/pets/ledger/config`。
  3. 导入确认后覆盖当前数据，再 `normalizeData()` + `syncData()`；旧宠物类型会在此阶段自动迁移。
- 反馈落文件流程：
  1. 提交反馈时先写入 `meta.feedbackEntries`，这是系统内唯一真实数据源。
  2. 若当前环境支持文件句柄，首次提交会提示选择 `class-pet-feedback.jsonl`，后续同一页面会话继续向该文件尾部追加一行 JSONL。
  3. 若不支持、权限拒绝、句柄失效或用户取消，系统会自动下载单条 `JSONL` 文件，但不会影响浏览器内反馈保存。
- 学生名单 CSV 导入流程：
  1. 选择 CSV 文件执行导入。
  2. 解析成功后会覆盖现有 `students/pets/ledger`。
  3. 推荐优先使用 `data-samples/students.csv` 模板对齐列格式。

## 7. 故障排查
| 症状 | 定位 | 处理 |
| --- | --- | --- |
| 导入 JSON 后提示“导入失败：缺少 schemaVersion / students / pets / ledger / config” | `scripts/app.js` 中 `validateImport()` | 使用系统导出的 JSON 作为参考模板；确认顶层字段完整后重试。 |
| 导入 CSV 提示“CSV 为空”或“第 X 行缺少学号或姓名” | `scripts/app.js` 中 `parseStudentCsv()` | 按 `studentNo,name,group,alias` 四列准备文件；保证每行至少有学号与姓名；可直接对照 `data-samples/students.csv`。 |
| 教师登录一直提示“PIN 不正确” | `scripts/app.js` 中 `hashPin()` 与 `config.teacherPinHash` 校验逻辑 | 先确认输入 PIN 与当前环境一致；若确实遗忘且允许丢失数据，可清理 `localStorage` 的 `class-pet-mvp` 后重置（会清空本机数据）。 |
| 展示模式搜不到拼音/英文名 | `scripts/app.js` 中 `matchDisplaySearch()`（依赖 `name/seatNo/group/alias`） | 在学生资料中补齐 `alias` 字段；搜索后可使用“清除搜索”恢复全量。 |
| 离线环境字体与设计稿不一致 | `styles/main.css` 顶部外链 Google Fonts 导入 | 断网时会走本地字体回退；如需统一视觉，需改为本地托管字体并移除外链 `@import`。 |

## 8. 变更与发布流程
- 变更准备：
  1. 明确变更范围（页面结构、样式、业务逻辑、数据格式）。
  2. 若涉及数据结构，先“导出 JSON”做基线备份。
- 实施与验证：
  1. 修改后至少用两种启动方式之一验证页面可用（直接打开或本地静态服务器）。
  2. 逐项回归：教师登录、学生管理、加分、班会喂养、展示模式分页/搜索、JSON 导入导出、CSV 导入。
  3. 观察浏览器控制台是否出现脚本错误。
- 发布方式（当前仓库可验证范围内）：
  - 项目无构建产物与发布脚本，发布单元即静态文件本身（`index.html`、`styles/`、`scripts/`、`assets/`、`data-samples/`）。

### 发布前核对项
- [ ] `index.html` 能正确按顺序加载 `styles/main.css`、`scripts/vendor/pinyin-pro.js`、`scripts/app/*.js` 与 `scripts/app.js`。
- [ ] 教师模式可登录/退出，PIN 设置与修改流程可用，且教师态顶部统一提供“返回仪表盘”和“退出教师模式”两个入口，前者位于左侧。
- [ ] 学生新增、编辑、删除后，宠物档案与流水状态一致。
- [ ] 运行时仅使用 8 种宠物类型；旧类型 `hamster` / `fish` 导入后会自动迁移。
- [ ] 班会喂养模式可进入、返回名单、一次重新领养、连续喂养、手动结束会话。
- [ ] 班会喂养模式支持先兑换食物，再从个人背包喂养；未使用食物会保留到后续回合。
- [ ] 展示模式仅从主页进入，退出后返回主页；分页、搜索、详情弹层可正常操作且保持只读。
- [ ] JSON 导出文件可生成，JSON 导入校验通过并可恢复数据。
- [ ] 教师仪表盘的数据安全状态、最近备份时间与“立即备份”入口显示正确。
- [ ] 反馈提交后会同步尝试落本地文件；支持环境持续写同一 `JSONL`，不支持环境自动退化为下载。
- [ ] 宠物图片来自 `assets/pets/<type>/*.png`，进入宠物页面后会按页面会话随机轮换且同页不闪烁。
- [ ] CSV 导入按模板可成功，且会按预期覆盖 `students/pets/ledger`。
- [ ] 危险操作“清空所有数据”有二次确认并按预期执行。
- [ ] 浏览器控制台无阻断级错误（语法错误/运行时异常）。

## 9. 维护检查清单（日/周/月）
### 日常（每个使用日）
- [ ] 打开主页、教师模式、班会喂养模式、展示模式，确认页面可进入；教师态确认只剩退出按钮。
- [ ] 新增 1 名学生并删除，确认宠物档案同步创建/删除。
- [ ] 执行一次加分、一次班会喂养，确认 `ledger` 有记录。
- [ ] 抽查 1 名学生，确认兑换食物会写入 `buy_food`，真正喂养会写入 `feed`，两者分开记录。
- [ ] 抽查 1 名未喂养学生，确认其可在班会喂养中重新领养 1 次；完成后资格立即失效。
- [ ] 结束前导出一次 JSON 备份。
- [ ] 抽查一名学生反复切换同一页面内的交互状态，确认宠物图片不闪烁；离开再进入页面后允许切换到同类另一张图。

### 每周
- [ ] 使用 `data-samples/students.csv` 做一次完整导入演练。
- [ ] 验证班会喂养模式的名单选择、一次重新领养、返回名单与手动结束会话。
- [ ] 验证展示模式搜索（姓名、学号、`alias`）与翻页。
- [ ] 抽查 3 名学生详情页：等级、XP、饥饿、心情显示正常。
- [ ] 检查“系统设置”中的 Schema 与升级阈值显示是否正确。

### 每月
- [ ] 在至少两种浏览器内执行一次完整回归（导入、管理、班会喂养、展示、导出）。
- [ ] 评估 `styles/main.css` 外链字体对离线环境的一致性影响。
- [ ] 审核是否发生 `schemaVersion` 或默认规则变更，并更新本文件。
- [ ] 清理历史备份文件，保留至少一份可恢复的最近稳定 JSON。

## 10. 附录
- 学生 CSV 模板头（`data-samples/students.csv`）：
  - `studentNo,name,group,alias`
- 关键数据结构（`scripts/app/core.js`、`scripts/app/model.js`）：
  - 顶层：`schemaVersion`、`students`、`pets`、`ledger`、`awardBatches`、`catalog`、`config`
  - `meta.feedbackEntries[*]`：教师反馈列表，结构为 `id / message / createdAt / source`
  - `students[*].foodInventory`：学生长期食物库存，结构为 `{ catalogId, quantity }[]`
  - `pets[*]`：包含 `petType`、`reAdoptAvailable`、`reAdoptedAt`
  - `petType` 合法值：`rabbit`、`panda`、`raccoon`、`capybara`、`cat`、`turtle`、`dog`、`bird`
  - `ledger[*].type`：包含 `award`、`award_revoke`、`buy_food`、`feed`、`re_adopt` 等业务动作
  - `awardBatches[*]`：包含 `id`、`reason`、`createdAt`、`entries`
  - `awardBatches[*].entries[*]`：包含 `id`、`studentId`、`points`、`reason`、`createdAt`、`revocableUntil`、`revokedAt`、`revokeReason`
  - `ledger[*].awardEntryId`：用于把单条 `award` / `award_revoke` 流水与对应加分条目稳定关联
  - 配置：`config.teacherPinHash`、`config.rules.xpPerLevel/defaultHunger/defaultMood`
- 关键存储位：
  - `LocalStorage`: `class-pet-mvp`
  - `SessionStorage`: `teacherAuthed`
- 关键文档与入口：
  - `README.md`
  - `index.html`
  - `scripts/app/`
  - `scripts/app.js`
  - `styles/main.css`
  - `data-samples/students.csv`
