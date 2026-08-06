import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"

let LOG_FILE = ""
const CACHE_TTL_MS = 10 * 60 * 1000

type Review = { safe: boolean; reason: string; completed: boolean }
type CacheEntry = Review & { expiresAt: number }

function ensureLogDir(file: string) {
  const dir = dirname(file)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function log(msg: string) {
  appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
}

function getCachedReview(cache: Map<string, CacheEntry>, key: string): Review | undefined {
  const cached = cache.get(key)
  if (!cached) return
  if (cached.expiresAt > Date.now()) return cached
  cache.delete(key)
}

function cacheReview(cache: Map<string, CacheEntry>, key: string, review: Review) {
  if (!review.completed) return
  cache.set(key, { ...review, expiresAt: Date.now() + CACHE_TTL_MS })
}

async function replyIfSafe(client: any, permission: any, safe: boolean) {
  if (!safe) return
  await client.postSessionIdPermissionsPermissionId({
    path: { id: permission.sessionID, permissionID: permission.id },
    body: { response: "once" },
  })
}

function localReview(
  permission: string,
  patterns: string[],
  directory: string,
  worktree: string,
): Review | null {
  // 危险规则写前面（返回 { safe: false, reason, completed: true }）
  // 安全规则写后面（返回 { safe: true, reason, completed: true }）
  // 判断不了返回 null，交给 agent
  return null
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
): Promise<Review> {
  const hasGit = worktree && worktree !== "/"
  const context = `工作目录: ${directory}\nGit 仓库路径: ${hasGit ? worktree : "无"}`
  const r = await client.session.create({ body: { title: "Security Review" } })
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
      return { safe: false, reason: "no response", completed: false }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonMatch) {
      log(`RAWJSON | ${permission} | ${op} | ${JSON.stringify(text)}`)
      return { safe: false, reason: "invalid JSON", completed: false }
    }

    const review = JSON.parse(jsonMatch)
    if (typeof review.safe !== "boolean" || typeof review.reason !== "string") {
      log(`RAWJSON | ${permission} | ${op} | ${JSON.stringify(text)}`)
      return { safe: false, reason: "invalid JSON", completed: false }
    }
    return { safe: review.safe, reason: review.reason, completed: true }
  } finally {
    await client.session.delete({ path: { id: sid } }).catch(() => {})
  }
}

export const server: Plugin = async ({ client, directory, worktree }) => {
  LOG_FILE = join(directory, ".opencode", "permission-debug.log")
  ensureLogDir(LOG_FILE)
  log("── Plugin started " + new Date().toLocaleString("zh-CN") + " ──")
  log(`[INFO] worktree="${worktree}" directory="${directory}"`)

  const reviewCache = new Map<string, CacheEntry>()
  let batch: { safe: boolean; line: string }[] = []
  let timer: any = null
  const TOAST_MS = 8000

  function record(label: string, permission: string, op: string, reason: string, safe: boolean) {
    const line = `${label.toUpperCase().padEnd(5)} | ${permission} | ${op} | ${reason}`
    log(line)
    batch.push({ safe, line })
    const variant = batch.every(r => r.safe) ? "success" : "warning"
    // Web/Headless 客户端会忽略该事件；即使未连接 TUI，服务端也会正常接收。
    client.tui.showToast({
      body: {
        title: "Security Review",
        message: batch.map(r => r.line).join("\n----\n"),
        variant,
        duration: TOAST_MS,
      },
    }).catch(() => {})
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { batch = []; timer = null }, TOAST_MS)
  }

  return {
    event: async ({ event }: any) => {
      if (event.type !== "permission.asked") return

      // log(`[EVENT] ${JSON.stringify(event)}`)

      const p = event.properties
      const patterns: string[] = p.patterns || []
      if (!patterns.length) return
      const op = patterns.join(" | ")

      try {
        const cacheKey = JSON.stringify([p.permission, patterns, p.metadata ?? null])
        const cached = getCachedReview(reviewCache, cacheKey)
        if (cached) {
          await replyIfSafe(client, p, cached.safe)
          record(cached.safe ? "allow" : "ask", p.permission, op, `${cached.reason} [cache]`, cached.safe)
          return
        }

        const local = localReview(p.permission, patterns, directory, worktree)
        if (local) {
          await replyIfSafe(client, p, local.safe)
          cacheReview(reviewCache, cacheKey, local)
          record(local.safe ? "allow" : "ask", p.permission, op, `${local.reason} [local]`, local.safe)
          return
        }

        const review = await securityReview(client, p.permission, op, directory, worktree)
        await replyIfSafe(client, p, review.safe)
        cacheReview(reviewCache, cacheKey, review)
        record(review.safe ? "allow" : "ask", p.permission, op, review.reason, review.safe)
      } catch (err: any) {
        record("error", p.permission, op, err.message, false)
      }
    },
  }
}
