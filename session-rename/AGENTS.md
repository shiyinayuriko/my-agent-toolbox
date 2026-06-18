---
name: session-rename
version: 0.1.0
type: plugin + command
platform: opencode
scope: [global, project]
---

# Session Rename

**⚠️ 安装/卸载/更新流程必须遵循 [全局 INSTALL.md](../INSTALL.md)。**
**⚠️ 维护规范（commit、命名、版本更新链路）必须遵循 [全局 AGENTS.md](../AGENTS.md)。**

## 安装指令

1. 无前置条件
2. 询问用户安装范围（全局 / 项目级），用户可取消
3. 执行文件安装：
   - 全局：
     - `session-rename.ts` → `~/.config/opencode/plugins/session-rename.ts`
     - `commands/session-rename.md` → `~/.config/opencode/commands/session-rename.md`
   - 项目级：
     - `session-rename.ts` → `.opencode/plugins/session-rename.ts`
     - `commands/session-rename.md` → `.opencode/commands/session-rename.md`
4. 更新对应的 `toolbox.json`（全局 → `~/.config/opencode/toolbox.json`，项目级 → `.opencode/toolbox.json`），记录 version、installed_at、updated_at、source、files 及各文件 MD5
5. 提醒用户重启 opencode 生效

## 维护说明

### 文件协作关系

```
commands/session-rename.md (command, subtask: true)
    ↓ LLM 按指令执行
session-rename.ts (plugin, 提供两个 tool)
    ├── get_session_context
    │     ↓ context.sessionID → session.get → parentID → session.messages
    │     ↓ 返回前 N 条消息摘要
    └── rename_session
          ↓ context.sessionID → session.get → parentID → session.update
```

- `session-rename.md` 定义 `/session-rename` 命令，以 subtask 方式运行，指示 LLM 调用两个 tool
- `session-rename.ts` 注册 plugin tool，通过 SDK client 访问 session API
- 两个 tool 都通过 `context.sessionID` + `session.parentID` 定位到父 session

### 修改联动

| 修改内容 | 需要同步检查 |
|---------|-------------|
| tool 的 session API 调用方式 | SDK 类型是否匹配 |
| command 的 LLM 指令 | tool 名称和参数是否一致 |
| 消息摘要逻辑 | parts 数据结构是否与 SDK 一致 |
| 任何功能变更 | **必须执行版本更新链路（见全局 AGENTS.md "版本管理"）** |

### 已知限制

- 依赖 `session.parentID` 字段定位父 session，如果直接在主 session 调用（非 subtask），则重命名当前 session
- 摘要仅取前 10 条消息，超长对话后期内容不参与标题生成
- 命令名使用 `/session-rename` 而非 `/rename`，避免与 opencode 内置命名冲突

### 否决方案

- **自动重命名**：监听 `session.idle` 事件自动重命名。否决原因：触发过于频繁，不可控。
- **standalone custom tool**：在 `.opencode/tools/` 中定义 tool，通过 HTTP fetch 调用 server API。否决原因：端口硬编码不可靠，custom tool 的 `context` 不提供 server URL。

### 验证方式

1. 安装后启动 opencode，进行一段对话
2. 输入 `/session-rename`，观察 subtask 是否正确执行
3. 检查 session 列表中标题是否已更新
