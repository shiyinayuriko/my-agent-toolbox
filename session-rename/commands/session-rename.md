---
description: Rename current session based on conversation
subtask: true
---
1. Call get_session_context to see what the conversation is about
2. Based on the context, generate a concise Chinese (中文) title that captures the main task or topic
3. Call rename_session with that title
