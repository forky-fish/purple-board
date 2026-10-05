# session-dock

An overview pane for Claude Code sessions: model, context, usage limits, git
branch, and a resettable list of what happened while you were away.

Three views, one data model (`<project>/.claude/dock-state.json`, written by the plugin):

| View | How | Needs |
|---|---|---|
| **Native pane** (main) | `/sdock`: docks beside the transcript (fullscreen, 110+ columns) or sits above the prompt on narrow terminals | the plugin only |
| **tmux pane** | `session-dock open` | tmux, Node |
| **Browser** | `session-dock serve` → http://127.0.0.1:7777 | Node |

The plugin changes nothing outside itself: no `settings.json` edits, no hooks or
status line to install. It reads session figures through the plugin API and writes one
file into the project's `.claude/` (turn off with the `writeState` option).

## Overview content

- session name, model, branch (ahead/behind), uncommitted files
- context fill, 5 h / 7 d rate limits, cost
- **Since you were away** (button *Reset*, or `/sdock reset`): turns and working time,
  commits since the reset (from Git), files edited, test runs, subagents. Built from
  tool events and Git; the model writes none of it.
- **Card** tab: your `.claude/dock.md` rendered; **Git** tab: status and recent commits.

## Install

```
/plugin marketplace add forky-fish/purple-board
/plugin install session-dock@purple-board
```

Try without installing: `claude --plugin-dir /path/to/purple-board`.

The tmux and browser views are the `bin/session-dock` script (Node, no dependencies):

```sh
git clone https://github.com/forky-fish/purple-board ~/.local/share/session-dock
ln -s ~/.local/share/session-dock/bin/session-dock ~/.local/bin/session-dock
```

## Use

`/sdock` opens the pane (`/sdock close`, `/sdock reset`). Keys in the pane: `1` `2` `3`
tabs, `x` reset, `r` reload.

tmux view, inside the tmux window of the session, in the project directory:

```sh
session-dock init      # create .claude/dock.md from the template
session-dock open      # open the dock pane on the right
```

Other commands: `session-dock serve` (browser), `session-dock reset`, `session-dock render [dir]` prints once, `session-dock watch [dir]`
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
