import { type Plugin, tool } from "@opencode-ai/plugin"

const MAX_MESSAGES = 10

async function getParentSessionID(client: any, sessionID: string): Promise<string> {
  const res = await client.session.get({ path: { id: sessionID } })
  const session = res.data
  return session?.parentID || sessionID
}

export const server: Plugin = async ({ client }) => {
  return {
    tool: {
      get_session_context: tool({
        description:
          "Get conversation context from the current (parent) session. Returns the first N messages with role and text content. Use this to understand what the session is about before generating a title.",
        args: {},
        async execute(_args, context) {
          const parentID = await getParentSessionID(client, context.sessionID)
          const res = await client.session.messages({ path: { id: parentID } })
          const messages: Array<{ info: any; parts: any[] }> = res.data ?? []

          const summary = messages.slice(0, MAX_MESSAGES).map((msg) => {
            const role = msg.info?.role ?? "unknown"
            const texts = (msg.parts ?? [])
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n")
            return `[${role}] ${texts || "(no text)"}`
          })

          if (!summary.length) return "No messages found in session."
          return summary.join("\n\n")
        },
      }),

      rename_session: tool({
        description:
          "Rename the current (parent) session with a new title. Call this after analyzing the conversation context.",
        args: {
          title: tool.schema.string().describe("New session title"),
        },
        async execute(args, context) {
          const parentID = await getParentSessionID(client, context.sessionID)
          await client.session.update({
            path: { id: parentID },
            body: { title: args.title },
          })
          return `Session renamed to: ${args.title}`
        },
      }),
    },
  }
}
