import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"

let LOG_FILE = ""

function ensureLogDir(file: string) {
  const dir = dirname(file)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function log(msg: string) {
  appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
}

function diag(parts: any[], info: any): string[] {
  const flags: string[] = []
  if (info?.error) {
    flags.push(`[Case2] info.error: ${info.error.name}`)
  }
  if (!parts.length) {
    flags.push("[Case3] empty parts array")
    return flags
  }
  const types = parts.map((p: any) => p.type)
  const hasText = types.includes("text")
  const hasReasoning = types.includes("reasoning")
  const hasOnlyLifecycle = types.every((t: string) =>
    ["step_start", "step_finish", "snapshot", "compaction"].includes(t),
  )
  if (!hasText && hasReasoning) flags.push("[Case1] only reasoning, no text part")
  if (!hasText && hasOnlyLifecycle) flags.push("[Case4] only lifecycle parts, no text")
  if (!hasText && !hasReasoning && !hasOnlyLifecycle)
    flags.push(`[Case3] no text, part types: [${types.join(", ")}]`)
  return flags
}

async function securityReview(
  client: any,
  permission: string,
  op: string,
  directory: string,
  worktree: string,
  parentSessionID: string,
): Promise<{ safe: boolean; reason: string }> {
  const hasGit = worktree && worktree !== "/"
  const context = `工作目录: ${directory}\nGit 仓库路径: ${hasGit ? worktree : "无"}`
  const r = await client.session.create({ body: { title: "Security Review", parentID: parentSessionID } })
  const sid = r.data?.id
  if (!sid) throw new Error("failed to create review session")

  try {
    const promptText = `操作类型: ${permission}\n内容: ${op}\n\n${context}`
    // log(`[PROMPT] ${JSON.stringify(promptText)}`)
    const result = await client.session.prompt({
      path: { id: sid },
      body: {
        agent: "security-review",
        parts: [{ type: "text", text: promptText }],
      },
    })

    // const text = result?.data?.parts?.find((p: any) => p.type === "text")?.text
    // if (!text) return { safe: false, reason: "no response" }
    const parts = result?.data?.parts ?? []
    const info = result?.data?.info
    const text = parts.find((p: any) => p.type === "text")?.text
    if (!text) {
      const flags = diag(parts, info)
      if (flags.length) log(`DIAG | ${permission} | ${op} | ${flags.join("; ")}`)
      return { safe: false, reason: "no response" }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonMatch) return { safe: false, reason: "invalid JSON" }

    return JSON.parse(jsonMatch)
  } finally {
    await client.session.delete({ path: { id: sid } }).catch(() => {})
  }
}

export const server: Plugin = async ({ client, directory, worktree }) => {
  LOG_FILE = join(directory, ".opencode", "permission-debug.log")
  ensureLogDir(LOG_FILE)
  log("── Plugin started " + new Date().toLocaleString("zh-CN") + " ──")
  log(`[INFO] worktree="${worktree}" directory="${directory}"`)

  return {
    event: async ({ event }: any) => {
      if (event.type !== "permission.asked") return

      // log(`[EVENT] ${JSON.stringify(event)}`)

      const p = event.properties
      const patterns: string[] = p.patterns || []
      if (!patterns.length) return
      const op = patterns.join(" | ")

      try {
        const review = await securityReview(client, p.permission, op, directory, worktree, p.sessionID)

        if (review.safe) {
          await client.postSessionIdPermissionsPermissionId({
            path: { id: p.sessionID, permissionID: p.id },
            body: { response: "once" },
          })
          log(`ALLOW | ${p.permission} | ${op} | ${review.reason}`)
        } else {
          log(`ASK   | ${p.permission} | ${op} | ${review.reason}`)
        }
      } catch (err: any) {
        log(`ERROR | ${p.permission} | ${op} | ${err.message}`)
      }
    },
  }
}
