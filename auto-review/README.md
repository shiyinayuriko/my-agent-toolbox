# Auto Review

> 版本：0.3.0

自动审核操作安全性。监听 opencode 的 `permission.asked` 事件，将操作描述发给 security-review agent 判定是否安全，安全操作自动放行，危险操作交由用户确认。

## 功能

- 安全操作（只读、Git 仓库内修改普通文件等）自动放行
- 危险操作（修改项目范围外文件、修改 Git 历史、操作密钥凭证等）需用户确认
- 通过 `git-common-dir` 识别同仓 linked worktree，并识别工作目录内的 Git 子项目
- 同一项目内完全相同的权限请求复用 10 分钟审核结果，缓存命中不续期
- 操作审核日志记录在 `.opencode/permission-debug.log`

## 前置条件

- opencode 环境
- 已配置 deepseek/deepseek-v4-flash provider

## 使用说明

安装后自动生效，无需额外配置。所有需要权限的操作都会经过安全审核。

## 项目级定制

如需对特定项目调整审核规则，在项目 `.opencode/agents/` 放置 `security-review.md` 覆盖全局 agent 即可。可自定义：

- 哪些路径/操作视为安全
- 哪些路径/操作视为危险
- 输出格式保持 `{safe, reason}` JSON 不变
