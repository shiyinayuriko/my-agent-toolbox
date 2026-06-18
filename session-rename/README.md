# Session Rename

> 版本：0.1.0

手动重命名 opencode session。输入 `/session-rename`，由 LLM 根据对话上下文自动生成简洁标题。

## 功能

- `/session-rename` 命令触发，以 subtask 方式运行，不污染主对话
- 自动读取当前 session 的对话内容，生成简洁的中文标题
- 适用于第一条消息是导入上下文/背景资料，导致默认标题无意义的场景

## 使用方法

在 opencode TUI 中输入：

```
/session-rename
```

即可自动重命名当前 session。

## 待实现

- **`/rename-fast` 内联模式**：不使用 subtask，直接在主对话中运行。LLM 已有上下文，无需额外获取对话内容，更省 token。代价是会在主对话中留一条消息。
