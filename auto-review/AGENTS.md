---
name: auto-review
version: 0.1.1
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
    ↓ 传入 parentID=p.sessionID，创建子会话，调用 agent
agents/security-review.md (subagent)
    ↓ 返回 JSON
auto-review.ts
    ↓ 解析结果，决定放行或交用户确认
```

- `auto-review.ts` 监听 `permission.asked` 事件，构造 prompt 发给 security-review agent
- 审核 session 通过 `parentID` 挂载为当前 session 的子 session，会显示在 session 层级中
- `security-review.md` 接收操作描述 + 上下文，按规则判定安全性，返回 `{safe, reason}` JSON
- plugin 解析 agent 返回的 JSON，safe=true 则调用 API 自动放行

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

### 验证方式

修改后启动 opencode，执行一些需要权限的操作（如编辑文件、运行命令），检查：
1. `.opencode/permission-debug.log` 中是否有正确的 ALLOW/ASK 记录
2. 安全操作（如 ls、cat）是否自动放行
3. 危险操作（如修改 /etc 下文件）是否正确拦截
