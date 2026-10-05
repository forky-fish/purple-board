# session-dock

> **Work in progress.** session-dock is young and changes often. Some tabs have only been
> tested headlessly, not in a real terminal; expect rough edges, and check the stability
> table below before relying on a tab. Bug reports and ideas are welcome as issues.

A dock for [Claude Code](https://claude.com/claude-code) sessions: a pane of tabs that shows
at a glance what a session is, how full its context and limits are, and what happened while
you were away.

```
┌ Dock ───────────────────────────────────────────┐
│ Overview  Plan  Sess  Agent  Notes  Art  Git  ? │
│                                                 │
│ ● idle   my-session   claude-sonnet-5-5         │
│ ⎇ feature/settings · 2 uncommitted              │
│                                                 │
│ context ████████░░░░░░░░░░░░  41%               │
│ 5h      ███░░░░░░░░░░░░░░░░░  18%               │
│ 7d      ████████████░░░░░░░░  60%               │
│ trend   ▁▂▂▃▄▅▆▃▄                               │
│                                                 │
│ Since you were away   2 h ago   ⟲ Reset         │
│ • 6 turns, 41 min of work                       │
│ • 3 commits, pushed                             │
│ • 7 files edited: settings.ts, …                │
│ • tests run 4×                                  │
│ 14:02  Added the keyboard shortcuts panel       │
└─────────────────────────────────────────────────┘
```

- **Zero tokens.** The dock never writes into the conversation or the prompt. Everything it
  shows comes from the plugin API, tool events and Git, and stays in its own files.
- **Not invasive.** No `settings.json` edits, no hooks or status line to install, nothing
  written into your projects. Its files live under `~/.claude/session-dock/`.
- **Per session.** Each session has its own state, so several sessions in one directory do
  not mix.
- **Placement.** The pane docks beside the transcript when the terminal is fullscreen and
  at least 110 columns wide, otherwise it sits above the prompt (Claude Code decides).

## Requirements

- Claude Code with the plugin pane API (developed and tested with **2.1.289**; older
  versions may not load the plugin).
- Linux or macOS. The Ports tab needs `ss` (Linux, package `iproute2`).
- Node.js 18+ only for the optional tmux and browser views.

## Install

### From GitHub (marketplace)

In Claude Code:

```
/plugin marketplace add forky-fish/purple-board
/plugin install session-dock@purple-board
```

Restart the session (or `/reload-plugins` and send one message), then type `/sdock`.

### From a local clone

```sh
git clone https://github.com/forky-fish/purple-board ~/.local/share/session-dock
claude --plugin-dir ~/.local/share/session-dock      # try it in one session
```

To load it in every session without the marketplace, add the directory to
`CLAUDE_CODE_PLUGIN_DIRS` (colon-separated) in the `env` block of `~/.claude/settings.json`.
Claude Code reads that variable only when a session starts.

Update with `git pull` in the clone, then `/reload-plugins`.

### Optional: tmux and browser views

```sh
ln -s ~/.local/share/session-dock/bin/session-dock ~/.local/bin/session-dock
session-dock open     # tmux side pane next to the session (run inside its tmux window)
session-dock serve    # browser view on http://127.0.0.1:7777
```

### Uninstall

`/plugin uninstall session-dock@purple-board` (or remove the directory from
`CLAUDE_CODE_PLUGIN_DIRS`), then delete `~/.claude/session-dock/` if you want your notes
and session history gone too.

## Use

| Command | What it does |
|---|---|
| `/sdock` | open the dock |
| `/sdock <tab>` | open a tab directly, e.g. `/sdock notes`, `/sdock git` |
| `/sdock reset` | start a new "Since you were away" window |
| `/sdock close` | close the dock (or Esc while it has the keyboard) |

Keys work while the dock has the keyboard (`/sdock` gives it; clicking it does too):
`1`–`9` switch tabs, `h` help, `r` reload, `Tab` walks buttons and inputs. The **Help** tab
lists every tab with its keys.

After `/reload-plugins`, `/sdock` comes back with the next message you send.

## Tabs and stability

| Tab | What it shows | Keys | Stability |
|---|---|---|---|
| **Overview** | status, model, branch, context and 5 h / 7 d meters with alarm, trend, cost, plan line, *Since you were away* (turns, commits, files, tests, subagents, timeline of answers) | `x` reset | **beta**: used daily |
| **Plan** | the session's task list (TodoWrite / task tools) with progress | | experimental |
| **Sessions** | every session of the last 24 h: status, name, project, model, context, branch | | experimental |
| **Agents** | subagents of this session | | experimental: untested with real agents |
| **Notes** | a list per project and a global one, kept across sessions | `a` add · `j`/`k` move · `t` done · `d d` delete · `m` move list · `p` target list | alpha: just reworked |
| **Artifacts** | artifacts published, attached (`/artifacts`) or linked in the session, as links | | experimental: links only, no preview in the pane |
| **Ports** | TCP ports your processes listen on, project ones marked | | experimental |
| **Card** | your `.claude/dock.md` (kept current by the `dock-card` skill) | | beta |
| **Git** | repository picker for all repos below the session root; status, graph, branches | `o` pick repo · `s` `g` `b` views · `f` rescan | alpha: graph auto-width not working yet |
| **Help** | how to use the dock and every tab | | beta |
| tmux view | overview and digest in a tmux pane | | beta |
| browser view | overview, sessions, notes, artifact previews | | experimental |

*beta*: works in daily use, details may change. *alpha*: works, known issues.
*experimental*: implemented and tested headlessly, not yet confirmed in a real terminal.

## Choose your tabs

All tabs ship with the plugin; you pick which ones appear and in which order. A tab that is
not listed does nothing: it neither loads data nor records events.

`~/.claude/session-dock/config.json` (all projects):

```json
{
  "tabs": [
    "overview", "notes", "git", "help",
    { "id": "todo", "title": "Todo", "file": "TODO.md" },
    { "id": "status", "title": "Status", "command": ["git", "status", "--short"] }
  ]
}
```

`<project>/.claude/dock.json` overrides the list for one project. Besides the built-in tabs,
a list can add **file tabs** (a Markdown file rendered) and, in the global config only,
**command tabs** (a command's output, run without a shell). A project config cannot add
command tabs, so a cloned repository can never make the dock run anything.

Built-in tab ids: `overview`, `plan`, `sessions`, `agents`, `notes`, `artifacts`, `ports`,
`card`, `git`, `help`.

## Write your own tab

Tabs are small modules (`hooks/modules/*.js`): an `id`, a `title`, `help`, an optional
`event()` for tool and turn events, an optional async `load()`, and a `render()` that returns
pane elements. See [docs/modules.md](docs/modules.md) for the contract and its rules (no
tokens, no access to the plugin API outside the core, nothing may break a session).

## Privacy

The dock reads your session locally and writes only to `~/.claude/session-dock/` (session
state, notes). It sends nothing anywhere. The timeline stores the first line of each answer
in that directory; delete it to forget. Keep cards and notes free of secrets.

## License

MIT
