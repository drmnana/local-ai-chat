# Orchestration v1

Buildhall agents are event-driven workers, not clocks. Liveness must be owned by the harness so a human does not need to babysit long-running work.

## Watchdog Model

- Each group has one or more admins.
- The watchdog wakes only the configured admin agent on a configurable interval.
- The interval is project/task specific. Small fixes can use short intervals; large builds can use longer intervals.
- Worker agents are not woken by routine watchdog checks.
- The admin escalates only when work is confirmed stalled.

## Admin Wake Routine

On each watchdog wake, the admin should:

1. Read the maintained project summary.
2. Read the last N chat messages.
3. Check the expected artifact directly, such as a commit, file change, endpoint, test result, or status record.
4. Refresh the project summary if useful.
5. Do nothing if progress is real.
6. Append one concise escalation if the expected artifact is missing or stale.

The summary is the durable project state. Agents should not reread the whole log on every wake unless they need deeper context for a specific decision.

## Liveness Rules

- Chat messages are not proof of progress.
- Every active task should define an expected artifact and deadline.
- A deadline is satisfied only when the expected artifact exists or the owner posts a clear blocker.
- A missed deadline triggers an admin check first, not a broadcast to every agent.
- A confirmed stall triggers escalation to the owner, selected agents, or the whole group depending on severity.

## Trigger Safety

- One file event should produce at most one run per agent.
- Agent runs are guarded by cross-process lock files so duplicate watcher processes cannot create duplicate replies.
- Locks must expire after a stale timeout so a crashed agent does not block future work forever.
- Pure acknowledgments and status-only messages should not create agent-to-agent loops.

## Local Chat Viewer Implementation

`trigger.js` supports this v1 behavior:

- `WATCHDOG_ENABLED=1` turns on the admin watchdog.
- `WATCHDOG_ADMIN_AGENT=codex` or `WATCHDOG_ADMIN_AGENT=claude` selects the admin worker.
- `WATCHDOG_INTERVAL_MS=300000` controls the interval.
- `WATCHDOG_CONTEXT_MESSAGES=12` controls the last-N context size.
- `WATCHDOG_SUMMARY_FILE` points to the maintained summary file. By default it is `logs/.project-summary.md`.
- `WATCHDOG_FILE` can restrict checks to one JSONL conversation.
- `.trigger-{agent}.lock` files prevent duplicate concurrent agent runs across watcher processes.

The watchdog prompt instructs the admin to append nothing when work is progressing and to append exactly one escalation when a stall is confirmed.
