# session-dock

An overview pane for Claude Code sessions: model, context, usage limits, git
branch, and a resettable list of what happened while you were away.

Three views, one data model (`~/.claude/session-dock/sessions/<session id>.json`, written by the plugin):

| View | How | Needs |
|---|---|---|
| **Native pane** (main) | `/sdock`: docks beside the transcript (fullscreen, 110+ columns) or sits above the prompt on narrow terminals | the plugin only |
| **tmux pane** | `session-dock open` | tmux, Node |
| **Browser** | `session-dock serve` → http://127.0.0.1:7777 | Node |

The plugin changes nothing outside itself: no `settings.json` edits, no hooks or
status line to install, nothing written into your projects. It reads session figures
through the plugin API and keeps its files under `~/.claude/session-dock/`. It never
adds text to the transcript or the prompt.

## Tabs

Each tab is a module (see [docs/modules.md](docs/modules.md)); default order:

- **Overview**: session name, model, branch, uncommitted files, context fill, 5 h / 7 d
  limits with colours and an alarm, context trend, cost, and **Since you were away**
  (button *Reset*, or `/sdock reset`): turns, working time, commits, files edited, test
  runs, subagents, plus a **Timeline** of the first line of each answer. Built from tool
  events, answers and Git, kept in the dock's own file; the model writes none of it.
- **Plan**: the session's task list (TodoWrite / Task tools) with a progress meter; the
  Overview also shows a one-line summary ("plan 3/7, now: ...").
- **Sessions**: one row per session active in the last 24 hours (status, name, project,
  model, context, branch, age).
- **Agents**: running and finished subagents with status and type.
- **Notes**: a project list and a global list of tasks, kept in Markdown files that
  survive Reset and new sessions.
- **Artifacts**: the pages this session published, as links (the browser view also shows
  them from their local source files).
- **Ports**: TCP ports your own processes listen on, with the ones started inside the
  project marked (needs `ss`; read only while the tab is shown).
- **Card**: your `.claude/dock.md` rendered. **Git**: status and recent commits.

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

`/sdock` opens the pane (`/sdock close`, `/sdock reset`, `/sdock <tab>`). Keys in the pane:
`1`..`9` tabs, `x` reset, `r` reload.

tmux view, inside the tmux window of the session, in the project directory:

```sh
session-dock init      # create .claude/dock.md from the template
session-dock open      # open the dock pane on the right
```

The views show the newest session started in the directory; `--session <id>` (or
`SESSION_DOCK_SESSION`) picks another. Other commands: `session-dock serve` (browser, 127.0.0.1
only), `session-dock reset`, `session-dock render [dir]` prints once, `session-dock watch [dir]`
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

Configure tabs in `~/.claude/session-dock/config.json` or `.claude/dock.json`: see
[docs/modules.md](docs/modules.md).

Keep cards free of secrets; they are plain files next to the code.

## License

MIT
