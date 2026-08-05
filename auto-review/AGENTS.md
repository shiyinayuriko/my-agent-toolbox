---
name: auto-review
version: 0.2.0
type: plugin + agent
platform: opencode
scope: [global, project]
---

# Auto Review

**⚠️ 安装/卸载/更新流程必须遵循 [全局 INSTALL.md](../INSTALL.md)。**
**⚠️ 维护规范（commit、命名、版本更新链路）必须遵循 [全局 AGENTS.md](../AGENTS.md)。**

## 安装指令

1. 确认前置条件：用户已配置 xiaomi/mimo-v2.5 provider
2. 询问用户安装范围（全局 / 项目级），用户可取消
3. 执行文件安装：
   - 全局：
     - `auto-review.ts` → `~/.config/opencode/plugins/auto-review.ts`
     - `agents/security-review.md` → `~/.config/opencode/agents/security-review.md`
   - 项目级：
     - `auto-review.ts` → `.opencode/plugins/auto-review.ts`
     - `agents/security-review.md` → `.opencode/agents/security-review.md`
4. 更新对应的 `toolbox.json`（全局 → `~/.config/opencode/toolbox.json`，项目级 → `.opencode/toolbox.json`），记录 version、installed_at、updated_at、source、files 及各文件 MD5
5. 提醒用户重启 opencode 生效

## 维护说明

### 文件协作关系

```
auto-review.ts (plugin)
    ↓ event hook → 检查项目实例内存缓存，未命中则创建独立子 session
agents/security-review.md (subagent)
    ↓ 返回 JSON
auto-review.ts
    ↓ 缓存合法结果 → record() → 日志 + toast 聚合通知 + 决定放行/交用户确认
```

- `auto-review.ts` 监听 `permission.asked` 事件，先查缓存，再执行 `localReview()` 本地策略，未命中则创建独立子 session 调用 agent
- `localReview()` 是本地策略入口，危险规则写前面、安全规则写后面、返回 null 交给 agent；策略结果同样缓存 10 分钟，命中日志追加 `[local]`
- 每个 plugin 项目实例维护独立内存缓存，key 由 permission、patterns、metadata 精确组成
- 合法审核结果固定缓存 10 分钟，命中不续期；空响应、非法 JSON 和异常不缓存
- 审核结果通过 `record()` 统一处理：写入调试日志 + 聚合进 toast 批量显示
- 审核异常通过 `ERROR` record 写入日志并显示 warning toast
- toast 聚合机制：每个结果到达时立即显示累积的完整记录（`----` 分隔），`TOAST_MS` 窗口内无新结果后清空批量缓冲
- `client.tui.showToast` 仅在 TUI 生效，web UI 中静默忽略
- `security-review.md` 接收操作描述 + 上下文，按规则判定安全性，返回 `{safe, reason}` JSON
- plugin 解析 agent 返回的 JSON，safe=true 则调用 API 自动放行

### 版本号更新时机

版本号仅在 commit 时更新，开发调试过程中不重复 bump。每次 commit 前确认 frontmatter version 已同步到最终值。

### 修改联动

| 修改内容 | 需要同步检查 |
|---------|-------------|
| agent 的判定规则 | plugin 的 prompt 构造是否提供了对应上下文 |
| plugin 的 prompt 格式 | agent 的解析逻辑是否匹配 |
| plugin 的 diag 逻辑 | 仅诊断用，不影响 agent |
| 任何功能变更 | **必须执行版本更新链路（见全局 AGENTS.md "版本管理"）** |

### 已知限制

- agent 使用 xiaomi/mimo-v2.5，推理能力有限，复杂场景可能误判
- 如果 agent 返回非 JSON 或空响应，plugin 默认不放行（安全降级）
- diag 函数用于诊断 agent 空响应的原因，日志在 `.opencode/permission-debug.log`
- toast 通知仅在 TUI 中生效，web UI 无等效面板 API
- 审核缓存仅存在于当前 plugin 实例内存中，opencode 重启后清空

### 验证方式

修改后启动 opencode，执行一些需要权限的操作（如编辑文件、运行命令），检查：
1. `.opencode/permission-debug.log` 中是否有正确的 ALLOW/ASK 记录
2. 安全操作（如 ls、cat）是否自动放行
3. 危险操作（如修改 /etc 下文件）是否正确拦截
