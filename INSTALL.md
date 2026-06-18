# 安装引导

本文件供 AI 读取，用于引导工具的安装、更新、卸载和查询。

---

## 用户操作方式

用户通过以下方式触发操作：

**方式一：提供本文件链接 + 说明意图**

```
请阅读 https://raw.githubusercontent.com/shiyinayuriko/my-agent-toolbox/main/INSTALL.md ，帮我安装工具
请阅读 https://raw.githubusercontent.com/shiyinayuriko/my-agent-toolbox/main/INSTALL.md ，帮我更新 auto-review
请阅读 https://raw.githubusercontent.com/shiyinayuriko/my-agent-toolbox/main/INSTALL.md ，帮我卸载 auto-review
请阅读 https://raw.githubusercontent.com/shiyinayuriko/my-agent-toolbox/main/INSTALL.md ，查看已安装工具状态
```

**方式二：直接说明意图（无链接）**

如果本地已有 toolbox.json，AI 可从其中的 `_meta.install_guide` 字段获取本文件 URL，无需用户再次提供。

```
帮我更新 auto-review
帮我卸载 auto-review
查看已安装工具状态
```

---

## 安装工具

当用户要求安装工具时，按以下流程执行：

1. 展示可用工具列表
2. 用户选择一个或多个工具
3. 读取对应工具目录的 AGENTS.md，解析 frontmatter
4. 展示支持的安装范围（scope），询问用户确认安装范围或取消
5. 用户确认 → 按子项 AGENTS.md 的安装指令执行
6. 用户拒绝 → 中止该工具安装
7. 安装完成后更新 `toolbox.json`

### 可用工具

| 工具 | 目录 | 类型 | 说明 |
|------|------|------|------|
| auto-review | auto-review/ | plugin + agent | 操作安全性自动审核 |
| session-rename | session-rename/ | plugin + command | `/session-rename` 命令，根据对话上下文重命名 session |

---

## 安装记录（toolbox.json）

所有已安装工具的信息集中记录在 `toolbox.json` 中：

- 全局安装：`~/.config/opencode/toolbox.json`
- 项目级安装：`.opencode/toolbox.json`

首次安装工具时自动创建该文件。

### 格式

```json
{
  "_meta": {
    "install_guide": "https://raw.githubusercontent.com/shiyinayuriko/my-agent-toolbox/main/INSTALL.md"
  },
  "auto-review": {
    "version": "1.0.0",
    "installed_at": "2025-06-18",
    "updated_at": "2025-06-18",
    "source": "https://github.com/shiyinayuriko/my-agent-toolbox/tree/main/auto-review",
    "files": {
      "/Users/you/.config/opencode/plugins/auto-review.ts": {
        "md5": "a1b2c3d4e5f6..."
      },
      "/Users/you/.config/opencode/agents/security-review.md": {
        "md5": "f6e5d4c3b2a1..."
      }
    }
  }
}
```

- `_meta.install_guide`：指向本文件的 URL，AI 在无用户提供链接时可自行获取
- 文件路径记录全路径（绝对路径）
- 读取时兼容相对路径和绝对路径两种格式
- 每个文件记录安装时的 MD5 校验值

### 生命周期操作

**安装：**
1. 按子项 AGENTS.md 的安装指令 copy 文件
2. 计算每个文件的 MD5
3. 在 toolbox.json 中新增条目（version、installed_at、updated_at、source、files + md5）
4. 如 toolbox.json 为新建，写入 `_meta.install_guide` 指向本文件的 GitHub URL

**更新（= 卸载旧版 + 安装新版）：**
1. 读取 toolbox.json 中该工具的 files
2. 逐个检查文件 MD5：
   - MD5 匹配 → 直接删除
   - MD5 不匹配 → 警告"文件已被本地修改"，询问是否覆盖
3. 按新版 AGENTS.md 安装指令重新 copy 文件
4. 更新 toolbox.json 条目（version、updated_at、files + md5）

**卸载：**
1. 读取 toolbox.json 中该工具的 files
2. 逐个检查文件 MD5：
   - MD5 匹配 → 直接删除
   - MD5 不匹配 → 警告"文件已被本地修改"，询问是否删除或跳过
3. 从 toolbox.json 中删除该条目

**查询：**
- 读取 toolbox.json，展示已安装工具及版本
- 对比 GitHub 上 frontmatter 的 version 字段判断是否有更新


