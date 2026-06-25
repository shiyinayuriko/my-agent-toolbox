import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"

let LOG_FILE = ""
let SHADOW_LOG_FILE = ""

const SHADOW_MODE = true
const SHADOW_MODEL = { providerID: "ai_gateway_cn", modelID: "qwen3.7-max" }

function ensureLogDir(file: string) {
  const dir = dirname(file)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function log(msg: string) {
  appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
}

function shadowLog(msg: string) {
  appendFileSync(SHADOW_LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
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
): Promise<{ safe: boolean; reason: string }> {
  const hasGit = worktree && worktree !== "/"
  const context = `工作目录: ${directory}\nGit 仓库路径: ${hasGit ? worktree : "无"}`
  const r = await client.session.create({ body: { title: "Security Review" } })
  const sid = r.data?.id
  if (!sid) throw new Error("failed to create review session")

  try {
    const promptText = `操作类型: ${permission}\n内容: ${op}\n\n${context}`
    const result = await client.session.prompt({
      path: { id: sid },
      body: {
        agent: "security-review",
        parts: [{ type: "text", text: promptText }],
      },
    })

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

async function shadowReview(
  client: any,
  permission: string,
  op: string,
  directory: string,
  worktree: string,
): Promise<{ elapsed: number; result: any; error?: string }> {
  const hasGit = worktree && worktree !== "/"
  const context = `工作目录: ${directory}\nGit 仓库路径: ${hasGit ? worktree : "无"}`
  const r = await client.session.create({ body: { title: "Security Review Shadow" } })
  const sid = r.data?.id
  if (!sid) return { elapsed: 0, result: null, error: "failed to create shadow session" }

  const start = Date.now()
  try {
    const promptText = `操作类型: ${permission}\n内容: ${op}\n\n${context}`
    const result = await client.session.prompt({
      path: { id: sid },
      body: {
        agent: "security-review",
        model: SHADOW_MODEL,
        parts: [{ type: "text", text: promptText }],
      },
    })

    const elapsed = Date.now() - start
    const parts = result?.data?.parts ?? []
    const text = parts.find((p: any) => p.type === "text")?.text

    if (!text) {
      const flags = diag(parts, result?.data?.info)
      return { elapsed, result: null, error: `no response; ${flags.join("; ")}` }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonMatch) return { elapsed, result: null, error: "invalid JSON" }

    return { elapsed, result: JSON.parse(jsonMatch) }
  } catch (err: any) {
    return { elapsed: Date.now() - start, result: null, error: err.message }
  } finally {
    await client.session.delete({ path: { id: sid } }).catch(() => {})
  }
}

async function compareReviews(
  client: any,
  permission: string,
  op: string,
  primary: any,
  shadow: any,
  shadowError?: string,
): Promise<{ safe_match: boolean | string; reason_semantic_match: boolean | string; detail: string }> {
  let sid: string | undefined
  try {
    const r = await client.session.create({
      body: {
        title: "Review Compare",
      },
    })
    sid = r.data?.id
  } catch (err: any) {
    return { safe_match: "N/A", reason_semantic_match: "N/A", detail: `compare session create failed: ${err.message}` }
  }
  if (!sid) return { safe_match: "N/A", reason_semantic_match: "N/A", detail: "compare session create returned no id" }

  try {
    let promptText: string
    if (shadowError) {
      promptText = `你是一个安全审核结果比对器。比较同一操作的两份审核结论。

操作: ${permission} | ${op}
审核A: ${JSON.stringify(primary)}
审核B: 调用失败 - ${shadowError}

输出 JSON，不要代码块标记：
{"safe_match":"N/A","reason_semantic_match":"N/A","detail":"影子调用失败，原因: ${shadowError}"}`
    } else {
      promptText = `你是一个安全审核结果比对器。比较同一操作的两份审核结论的safe值和reason语义是否一致。

操作: ${permission} | ${op}
审核A: ${JSON.stringify(primary)}
审核B: ${JSON.stringify(shadow)}

判定标准：
- safe_match: 两边safe布尔值完全相同为true
- reason_semantic_match: reason语义一致（措辞不同但意思相同也算一致）为true
- detail: 用一两句话描述差异或一致的情况

输出 JSON，不要代码块标记：
{"safe_match":true,"reason_semantic_match":true,"detail":"..."}`
    }

    const result = await client.session.prompt({
      path: { id: sid },
      body: {
        agent: "review-compare",
        parts: [{ type: "text", text: promptText }],
      },
    })

    const parts = result?.data?.parts ?? []
    const text = parts.find((p: any) => p.type === "text")?.text
    if (!text) return { safe_match: "N/A", reason_semantic_match: "N/A", detail: "no compare response" }

    const jsonMatch = text.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonMatch) return { safe_match: "N/A", reason_semantic_match: "N/A", detail: "invalid compare JSON" }

    return JSON.parse(jsonMatch)
  } catch (err: any) {
    return { safe_match: "N/A", reason_semantic_match: "N/A", detail: `compare error: ${err.message}` }
  } finally {
    await client.session.delete({ path: { id: sid } }).catch(() => {})
  }
}

async function runShadowFlow(
  client: any,
  permission: string,
  op: string,
  directory: string,
  worktree: string,
  primary: { safe: boolean; reason: string },
  primaryElapsed: number,
) {
  try {
    const shadow = await shadowReview(client, permission, op, directory, worktree)
    const compare = shadow.error
      ? await compareReviews(client, permission, op, primary, null, shadow.error)
      : await compareReviews(client, permission, op, primary, shadow.result)

    const primaryLine = `  primary  | ${primaryElapsed}ms | ${JSON.stringify(primary)}`
    const shadowLine = shadow.error
      ? `  shadow   | ${shadow.elapsed}ms | ERROR: ${shadow.error}`
      : `  shadow   | ${shadow.elapsed}ms | ${JSON.stringify(shadow.result)}`
    const compareLine = `  compare  | safe_match=${compare.safe_match} | reason_semantic_match=${compare.reason_semantic_match} | ${compare.detail}`

    shadowLog(`${permission} | ${op}\n${primaryLine}\n${shadowLine}\n${compareLine}\n-----`)
  } catch (err: any) {
    shadowLog(`${permission} | ${op}\n  SHADOW_FLOW_ERROR: ${err.message}\n-----`)
  }
}

export const server: Plugin = async ({ client, directory, worktree }) => {
  LOG_FILE = join(directory, ".opencode", "permission-debug.log")
  ensureLogDir(LOG_FILE)
  log("── Plugin started " + new Date().toLocaleString("zh-CN") + " ──")
  log(`[INFO] worktree="${worktree}" directory="${directory}"`)

  if (SHADOW_MODE) {
    SHADOW_LOG_FILE = join(directory, ".opencode", "permission-shadow.log")
    ensureLogDir(SHADOW_LOG_FILE)
    shadowLog("── Shadow mode started " + new Date().toLocaleString("zh-CN") + " ──")
  }

  return {
    event: async ({ event }: any) => {
      if (event.type !== "permission.asked") return

      const p = event.properties
      const patterns: string[] = p.patterns || []
      if (!patterns.length) return
      const op = patterns.join(" | ")

      try {
        const primaryStart = Date.now()
        const review = await securityReview(client, p.permission, op, directory, worktree)
        const primaryElapsed = Date.now() - primaryStart

        if (review.safe) {
          await client.postSessionIdPermissionsPermissionId({
            path: { id: p.sessionID, permissionID: p.id },
            body: { response: "once" },
          })
          log(`ALLOW | ${p.permission} | ${op} | ${review.reason}`)
        } else {
          log(`ASK   | ${p.permission} | ${op} | ${review.reason}`)
        }

        if (SHADOW_MODE) {
          runShadowFlow(client, p.permission, op, directory, worktree, review, primaryElapsed)
        }
      } catch (err: any) {
        log(`ERROR | ${p.permission} | ${op} | ${err.message}`)
      }
    },
  }
}
