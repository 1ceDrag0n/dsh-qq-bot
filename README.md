# dsh-qq-bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OneBot v11](https://img.shields.io/badge/OneBot-v11-2496ED.svg)](https://github.com/botuniverse/onebot-11)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek-Harness-4F46E5.svg)

> 给 DeepSeek Harness 接上 QQ：一个有长期记忆、有人设、能联网、能看图、能自己管理表情包的 DSH agent。

把 **DeepSeek Harness** 的智能体接入 QQ 的插件。

通过 OneBot v11 连接 NapCat / Lagrange / LLOneBot，把 QQ 私聊和群聊消息交给一个真正的 DSH agent 处理，再把回复发回 QQ。插件同时负责长期记忆、人设、表情包、日记、群管理和设置页面。

> 这是一个社区插件，不是 QQ 官方客户端。QQ 登录由 NapCat / Lagrange 等 OneBot 实现完成，本插件只负责 OneBot 消息收发。

## 它和普通 QQ 机器人有什么不同

- **不是关键词回复器**：每条消息交给一个真正的 DSH agent，能调用联网搜索、网页读取、图片解析和只读文件工具
- **不是一个大杂烩**：私聊和群聊各自拥有独立 agent、独立模型和独立上下文，互不串线
- **不是金鱼记忆**：按 QQ 号识别联系人，长期记忆、摘要压缩、对每个人的印象和关系都会持续累积
- **不是固定角色**：多套人设板独立保存，各自拥有独立记忆空间、自我认知和聊天上下文
- **不是裸奔**：agent 只拿只读和联网工具，shell、写入、编辑、子代理、workflow 都不开放

## 适合谁

- 想让 QQ 里出现一个真正有记忆、有性格的 AI 角色
- 已经有 NapCat / Lagrange / LLOneBot，想直接接 DSH
- 想分别给私聊和群聊配不同模型、不同人设、不同上下文
- 想自己改人设、记忆、表情包、日记和群管理策略

## 快速开始

```text
1. 安装 NapCat / Lagrange / LLOneBot，登录 QQ
2. 开启 OneBot v11 正向 WebSocket（默认 ws://127.0.0.1:3001）
3. 在 DSH 中安装本仓库，打开 设置 → QQ 聊天
4. 填人设、选模型、点保存，然后给机器人发一条私聊
```

详细安装见下文，或直接看 [Releases](https://github.com/1ceDrag0n/dsh-qq-bot/releases)。

## 功能

- **私聊 / 群聊**：私聊默认回复；群聊支持 @、唤醒词、回复机器人、叫人设名触发
- **独立模型**：私聊和群聊分别选择 provider / model / reasoning effort，各有独立 agent 会话
- **连续输出**：模型可按语境用 `[[SPLIT]]` 拆成多条独立 QQ 消息，带打字间隔
- **长期记忆**：按 QQ 号识别联系人，来往达到阈值后自动摘要、提取事实、形成印象
- **人设预设**：多套独立人设板，选择即载入；每个预设拥有独立的联系人/群记忆、自我认知和聊天上下文
- **联网搜索**：可单独配置搜索模型，聊天模型通过 `qq_web_search` 调用独立搜索会话
- **图片解析**：可单独配置视觉模型；聊天模型纯文本也能通过 `qq_describe_image` 看图
- **表情包**：自动收藏、同步 QQ 收藏、按语境发送、概率发表情、批量删除
- **日记**：以角色口吻写私人日记，默认保存到 `<dataDir>/diary`
- **群管理**：警告 → 禁言 → 踢人的严格策略，支持自动 @ 主人求助
- **好友/群请求**：自动或手动同意、拒绝或忽略；设置页请求卡片按键后会就地显示结果/失败原因，支持「全部忽略」与 `#qq approve/reject/ignore`
- **主动发言**：群聊和私聊都可主动开口；私聊只发给白名单联系人
- **连续会话**：一个私聊/群聊通道对应一个长期 agent，按轮次自动重建，避免上下文无限增长
- **设置页面**：DSH Web GUI 内的一级设置页，实时状态、模型选择、人设、记忆、表情包、日记、连接参数

## English overview

**dsh-qq-bot** connects a DeepSeek Harness agent to QQ through OneBot v11
(NapCat / Lagrange / LLOneBot).

It is not a keyword bot. Every QQ message is handled by a real DSH agent with
web search, web fetch, image understanding and read-only file tools. Private
and group chats run separate agents with independent model choices, context,
long-term memory and persona boards. The agent is restricted to read-only and
web tools; shell, file writes, subagents and workflows are not exposed.

## 架构

```text
QQ 客户端
  ↕
NapCat / Lagrange / LLOneBot（OneBot v11）
  ↕  WebSocket（事件）+ HTTP（动作，可选兜底）
DSH Host 插件
  ├─ 去重 / 触发判断 / 串行队列
  ├─ DSH Agent（ctx.agents）
  │    ├─ 系统提示：底层人设 + 自我认知
  │    ├─ 工具白名单：web / 只读文件 / QQ 工具
  │    └─ 回合结束 → 取最终文本 → 分段发送
  ├─ 记忆引擎：联系人/群 recent + LLM 摘要压缩 + 人设演化
  └─ HTTP API：/qq-bot/status /overview /settings /memory /models /groups ...
  ↕ 同源 fetch
设置页（React，注册到 settings.section）
```

安全边界：

- agent 只暴露 `web_search`、`web_fetch`、`read`、`glob`、`grep`、`read_image` 等只读/联网工具
- 不授予 shell、写入、编辑、子代理、workflow 等危险工具
- 插件通过 `tools.restrict + tools.guard` 双重限制；即使群里有提示词注入，也不能让机器人执行命令或改文件
- QQ 消息里不能直接调用宿主的交互式工具

## 环境要求

1. DSH（桌面版或 Web 版均可）
2. NapCat / Lagrange / LLOneBot 已完成 QQ 登录
3. 启用 OneBot **正向 WebSocket**，默认地址通常是 `ws://127.0.0.1:3001`
4. 可选：启用 HTTP API，作为 WebSocket 断开时的发送兜底

不要和 AstrBot 等其它程序同时接同一个 OneBot 账号，否则会出现双回复。

## 安装

### 方式一：当前会话的插件管理器

把本仓库放到本机任意目录，然后在 DSH 中使用 `plugin_manager` 的 `install_bundle`，target 指向该目录。

安装后：

- 左侧设置出现一级入口 **QQ 聊天**
- Host 日志出现 `[qq-bot]` 前缀
- 设置页会自动连接 `ws://127.0.0.1:3001`

### 方式二：手动加入 profile

```sh
dsh plugin --profile web add /path/to/dsh-qq-bot
```

或在 profile 的 `package.json` 里加入本地依赖，并把 `@local/dsh-qq-bot` 追加到 `dsh.profile.bundles`，然后重启 DSH。

### 方式三：从 npm 安装（改名发布后）

默认包名是 `@local/dsh-qq-bot`，适合本地 link。发布到 npm 时请改成自己的 scope：

```sh
dsh plugin --profile web add @your-scope/dsh-qq-bot
```

并同步修改 `package.json`、`cordis.patch.yml` 和 `client.js` 里的包名/id。

## 配置

打开 **设置 → QQ 聊天**。设置页左侧分为：

```text
模型 | 人设 | 对话 | 群聊 | 记忆 | 安全 | 内容 | 连接
```

### 模型

- 群聊模型 + 思考强度
- 私聊模型 + 思考强度
- 图片解析模型
- 联网搜索模型

模型留空时跟随默认模型。每个通道有自己的 agent 会话，不会串上下文。

### 人设

- 人设预设：每个预设是一块独立人设板，下拉选择即载入
- 新建预设：新开一块空白板，不覆盖已保存预设
- 保存当前并新建预设：复制当前板
- 底层人设、说话风格、行为准则、预设对话
- 人设演化总开关：人设页「人设演化」卡片顶部的开关，关闭后不再演化、自我认知也不进入提示词，机器人只按底层人设说话
- 自动演化：每 N 次互动，根据长期记忆更新自我认知（总开关关闭时无效）
- 命令行也能切：`#qq evolve on` / `#qq evolve off`

### 对话

- 群聊唤醒词、@、回复机器人、叫人设名
- 私聊总是回复
- 回复格式：长回复自动分段、按语境连续发多条、引用、去 Markdown
- 报错回复：模型报错 / 超时 / 空回复时发送自定义文案，可用 `{error}` 插入摘要
- 上下文条数
- 主动发言开关、安静时间、冷却、概率
- 主动私聊白名单：只主动私聊勾选的联系人；空白名单关闭主动私聊

### 群聊

- 在哪些群发言：从已加入群列表勾选；不勾选 = 所有群
- 群聊上下文条数
- 群聊记忆：按群号显示摘要、消息数，可逐群清空

### 记忆

- 长期记忆开关、记忆阈值、压缩条数、摘要长度
- 联系人前 3 个；查看更多进入独立页面，支持搜索、编辑、清空

### 安全

- 主人 QQ、管理员 QQ
- 黑名单、白名单
- 好友/群请求自动同意
- 群管理严格策略：警告次数、禁言次数、冷却、警告文案、攻击关键词
- 好友/群请求卡片：同意 / 拒绝（发往 OneBot）、忽略（只在本地移除，不向 QQ 发送操作）、全部忽略；每行就地显示结果与失败原因

### 内容

- 日记目录、自动续写间隔、素材来源
- 表情包目录、自动收藏、同步 QQ 收藏、冷却、自动发表情概率

### 连接

- OneBot WebSocket / HTTP 地址
- access token
- agent preset、重建轮数、回复超时、日志开关
- 发送测试消息

## 数据与隐私

所有运行数据默认保存在本机：

```text
~/.dsh-qq-bot/
├── settings.json   # 配置（可能含 access token，注意不要泄露）
├── state.json      # 联系人、群、消息、记忆、表情包元数据
├── diary/          # 日记
└── stickers/       # 表情包文件
```

`state.json` 会包含 QQ 号、昵称、聊天内容和长期记忆。**不要把这些文件提交到公开仓库。**

本仓库的 `.gitignore` 已排除：

- `settings.json`
- `state.json`
- `diary/`
- `stickers/`
- `node_modules/`
- 日志和本地测试文件

发布前请自行检查 `settings.json`、`state.json`、截图、日志和个人路径。

## 开发

```text
index.js           Host 插件：OneBot、agent、记忆、路由、工具
client.js          Web 设置页（React，无 JSX）
cordis.patch.yml   bundle 插入 + qq-bot agent preset
locale/            设置页标题与描述
icon.svg           设置页图标
```

主要入口：

- `Config`：schemastery 配置 schema
- `normalizeConfig` / `SETTINGS_SHAPE`：配置归一化与保存校验
- `handleInbound` / `wakeMatch`：触发逻辑
- `buildSystemPrompt` / `buildTurnPrompt`：提示词
- `ensureAgent` / `chatAgents`：私聊/群聊双 agent
- `splitReply` / `sendReply`：连续输出与发送
- `compressContact` / `compressGroup` / `evolvePersona`：记忆与人设演化
- `registerRoutes`：设置页 HTTP API

提交前运行：

```sh
node --check index.js
node --check client.js
```

## 常见问题

| 现象 | 检查 |
| --- | --- |
| 设置页显示连接错误 | NapCat 是否启动、WS 地址/端口/token、WebSocket 服务是否开启 |
| 已连接但不回复 | 群聊是否 @ / 带唤醒词；`trigger.groupAlways`；`access.groups/whitelist` |
| 人设改了保存不了 | 修改后点顶部或底部「保存设置」；新建预设需要「创建」后再保存 |
| 机器人莫名私聊人 | 「对话 → 主动私聊白名单」是否为空；同时检查 `proactive.enabled` |
| 回复“没有可用模型” | 在 DSH 配置默认模型，或在私聊/群聊模型选择器里选一个模型 |
| 搜索报缺少 API key | 搜索模型选有搜索凭据的 provider，或在 DSH 配置 Exa/Perplexity |
| 群列表读取失败 | OneBot 是否在线；设置页会回退到本地已知群 |

## 许可

MIT License。见 [LICENSE](LICENSE)。

本项目按“现状”提供，不对 QQ 账号安全、封号风险、数据丢失或第三方服务可用性作担保。使用前请自行评估平台规则和账号风险。

## 贡献

欢迎 issue 和 PR，详见 [CONTRIBUTING.md](CONTRIBUTING.md)：

1. 不要提交 `settings.json`、`state.json`、真实 QQ 号、聊天记录、access token
2. 不要提交个人日记、表情包、上传图片
3. 保持只读工具白名单，不要为了功能方便开放 shell / 写入
4. 新增配置时同时更新 `Config`、`normalizeConfig`、`SETTINGS_SHAPE` 和设置页

## 安全

如果你发现安全问题，请不要公开提交可利用细节；先通过 issue 描述影响范围，或私下联系维护者。
详见 [SECURITY.md](SECURITY.md)。

## 配置示例

不包含账号和 token 的最小配置示例见 [settings.example.json](settings.example.json)。
