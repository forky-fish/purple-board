---
name: dock-card
description: Keep the session dock card (.claude/dock.md) up to date so the session-dock sidebar shows goal, current block, next steps and what the session waits for. Use at session start, after finishing a block, when blocked, and before going idle.
---

# Dock card

The sidebar `session-dock` renders `.claude/dock.md` in the project root next to this
session. Keep it short: it is read at a glance in a narrow pane (about 40 columns).

When to update:
- at session start (create it from the template if it is missing),
- when a block starts, finishes or gets blocked,
- before going idle or waiting for the user.

Format (headings fixed, content free):

```markdown
# <Project>

**Goal:** <one line>

## Now
- <current block and state>

## Next
1. <next step>

## Waiting for
- [ ] GATE <decision or action needed from the user>

## Notes
- <test count, open PR, model, anything worth a glance>
```

Rules:
- At most about 25 lines; drop finished items instead of collecting history.
- Status words `DONE`, `WAIT`, `GATE`, `BLOCKED`, `ERROR` are highlighted by the renderer.
- No secrets, tokens, credentials or transcript excerpts.
- Branch, last commit and uncommitted files are added live by the renderer; do not repeat them.
- Add `.claude/dock.md` to the project's `.gitignore` unless the user wants it tracked.
