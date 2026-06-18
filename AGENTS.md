# My Agent Toolbox

这是一个个人 AI agent 工具箱 repo，收集不同类型的小工具（plugin、skill、agent、MCP 等），每个工具完全独立，按需安装。

## 文件职责

本 repo 中有以下文件，各司其职：

| 文件 | 位置 | 读者 | 职责 |
|------|------|------|------|
| README.md | repo 根 | 人 | 工具箱索引，浏览导航 |
| AGENTS.md | repo 根 | AI（维护场景） | 开发维护规范 |
| INSTALL.md | repo 根 | AI（安装场景） | 安装引导 + toolbox.json 规范 |
| 子项 README.md | 工具目录 | 人 | 工具功能说明、使用方法 |
| 子项 AGENTS.md | 工具目录 | AI | 安装元数据 + 安装指令 + 维护说明 |

---

## 维护规范

以下是在本 repo 中开发和维护工具时必须遵守的规则。

### 目录结构

```
my-agent-toolbox/
├── AGENTS.md              # 本文件：开发维护规范
├── INSTALL.md             # 安装引导（AI 安装时读取）
├── README.md              # 工具索引（人看）
├── .gitignore
├── <tool>/
│   ├── README.md          # 功能说明（人看）
│   ├── AGENTS.md          # 安装 + 维护（AI 看）
│   └── ...                # 工具本体文件
```

- 每个工具一个顶级目录，平铺排列
- 工具之间完全独立，无共享依赖
- 构建配置、依赖管理等由各工具自行决定

### 子项 AGENTS.md 格式

每个工具的 AGENTS.md 必须包含 YAML frontmatter。通用必填字段：

```yaml
---
name: <工具名，与目录名一致>
version: <semver>
type: <plugin | skill | agent | mcp，可组合>
scope: [global, project]  # 支持的安装范围
---
```

其他字段由各工具根据自身情况自行定义（如入口文件、依赖文件、前置条件等）。

Frontmatter 之后必须包含：
- `## 安装指令` — 指令式，告诉 AI 具体执行步骤（文件放哪里、怎么注册）
- `## 维护说明` — 文件协作关系、修改联动、已知限制、验证方式（复杂工具）

编写 `## 安装指令` 时的通用建议：
- 不使用 symlink，通过 copy 方式安装
- 全局安装目录通常在 `~/.config/opencode/` 下，项目级在 `.opencode/` 下
- 明确列出每个文件的源路径和目标路径
- 最后一步更新 toolbox.json（格式见 INSTALL.md）

### 子项 README.md 内容

面向人类用户，说明工具的功能和使用方法。具体包含哪些段落由各工具自行决定。

不包含安装元数据或安装步骤（这些在 AGENTS.md 里）。

### 版本管理

- 使用 semver（major.minor.patch）
- 修改工具内容时必须同步更新以下位置的版本号：
  1. 子项 AGENTS.md frontmatter 的 `version` 字段（主版本源）
  2. 子项 README.md 中的版本显示（抄送）
  3. 全局 README.md 工具列表中的版本号（抄送）

### Commit 规范

```
<tool-name>: (<type>) <简要描述>
```

type 类型：
- `feat` — 新功能
- `fix` — 修复
- `doc` — 文档变更
- `refactor` — 重构（不影响功能）
- `chore` — 杂项（版本号更新、配置调整等）

示例：
- `auto-review: (fix) diag logic for empty response`
- `auto-review: (chore) bump to 1.1.0`
- `toolbox: (doc) update frontmatter schema`
- `auto-review: (feat) add custom rule override support`

### 命名防冲突

- 安装到目标目录的文件名必须唯一，避免不同工具间互相覆盖
- 使用工具名或功能名命名，避免 `plugin.ts`、`server.ts`、`agent.md` 等通用名
- 新增工具前检查已有工具的 frontmatter 和 toolbox.json，确认无同名冲突

### 发布前检查

修改工具后，提交前确认：

1. frontmatter version 已更新
2. README 正文与代码行为一致
3. 如工具包含多个文件，确认它们之间的逻辑一致
4. 安装文件名不与已有工具冲突
5. 如为新增工具，确认 INSTALL.md 可用工具表已更新
