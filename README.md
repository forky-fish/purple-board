# session-dock

A sidebar for Claude Code sessions: the most important facts of a session as
rendered Markdown in a narrow tmux pane next to the session.

```
┌──────────────────────────────┬──────────────────────┐
│ claude                       │ EXAMPLE APP          │
│                              │ ━━━━━━━━━━━          │
│ > working on block 3 …       │ Goal: ship settings  │
│                              │                      │
│                              │ Now                  │
│                              │ • Block 3: keyboard  │
│                              │                      │
│                              │ Waiting for          │
│                              │ ☐ GATE sync decision │
│                              │ ──────────────────── │
│                              │ Live                 │
│                              │ branch: feature/x    │
└──────────────────────────────┴──────────────────────┘
```

Claude Code has no sidebar API, so the dock is a tmux side pane. Two parts:

- `bin/session-dock`: renderer and watcher (Node, no dependencies). It renders
  `<project>/.claude/dock.md` and appends live git facts (branch, last commit,
  uncommitted files). It redraws when the card changes and every 5 seconds.
- `skills/dock`: a Claude Code skill (shipped as the `session-dock` plugin) that tells the
  session to keep the card current: goal, now, next, waiting for, notes.

## Install

```sh
git clone https://github.com/forky-fish/purple-board ~/.local/share/session-dock
ln -s ~/.local/share/session-dock/bin/session-dock ~/.local/bin/session-dock
```

Plugin (skill) in Claude Code:

```
/plugin marketplace add forky-fish/purple-board
/plugin install session-dock@purple-board
```

## Use

Inside the tmux window of a Claude Code session, in the project directory:

```sh
session-dock init      # create .claude/dock.md from the template
session-dock open      # open the dock pane on the right
```

Other commands: `session-dock render [dir]` prints once, `session-dock watch [dir]`
is what the pane runs. `SESSION_DOCK_WIDTH` sets the pane width (default 44),
`SESSION_DOCK_FILE` points to another card.

Try it with the example card:

```sh
SESSION_DOCK_FILE=examples/dock.md session-dock render
```

## Card format

See [templates/dock.md](templates/dock.md) and [examples/dock.md](examples/dock.md).
Supported Markdown: headings, bold, italics, inline code, code blocks, lists,
numbered lists, task boxes, quotes, rules, links (text only) and tables (shown as
`key: value` lines in the narrow pane). The words `DONE`, `OK`, `WAIT`, `GATE`,
`TODO`, `BLOCKED`, `FAIL` and `ERROR` are coloured.

Keep cards free of secrets; they are plain files next to the code.

## License

MIT
