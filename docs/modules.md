# Dock modules

The dock core (`hooks/register.js`) owns the pane, the tab strip, the per-session state
file and the refresh timer. Everything shown in a tab is a module in `hooks/modules/`.

## Module contract

```js
export default {
  id: 'example',            // unique, [\w-]{1,32}
  title: 'Example',         // tab label
  short: 'Ex',              // optional shorter label for inactive tabs when the bar is crowded
  event(ctx, ev) {},        // optional, may be async
  async load(ctx) {},       // optional
  render(ctx, el) { return [ /* elements */ ] },
}
```

- `event(ctx, ev)` is called for each thing that happens in the session, whether or not the tab
  is shown. `ev` is `{ type: 'tool', e, result }` (a finished tool call), `{ type: 'turn', e }`
  (a finished turn) or `{ type: 'reset' }`. Use it to record facts.
- `load(ctx)` is async and runs on refresh (pane open, tab switch, timer, reload key) only
  while the module's tab is the active one. Use it to read files or run commands.
- `render(ctx, el)` is sync and returns an array of elements. `el` holds the pane's
  constructors: `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown`.
  Every top-level element needs a unique `key`. `Code` takes `source` (not children),
  `Markdown` takes `text` (about 10k characters at most; use `clip()` from `lib/util.js`).

`ctx` provides:

| Member | Meaning |
|---|---|
| `ctx.root`, `ctx.sessionId`, `ctx.dir` | project root, session id, `~/.claude/session-dock` |
| `ctx.data(id, makeDefault)` | persistent per-session data, saved with the session file |
| `ctx.live(id)` | volatile object, refilled by `load()` |
| `ctx.view` | shared live facts: `session`, `usage`, `git`, `commits` |
| `ctx.state` | the whole saved state (`since`, `head`, `modules`) |
| `ctx.readFile`, `writeFile`, `exists`, `list`, `run(argv, timeoutMs)`, `agents()` | I/O (files, a command in the project root, the session's agent list) |
| `ctx.reset()`, `ctx.invalidate()`, `ctx.refresh()` | start a new window, redraw, reload the active tab |

## Rules

1. **The plugin API `$` stays in `hooks/register.js`.** It is only used as `$.noun.event(...)`,
   passed only to functions in that file, and never stored in an object or passed across an
   import. Modules get I/O through the `ctx` closures built by `io($)` in `register.js`;
   add a closure there when a module needs something new. (The plugin has no file delete.)
2. **Element props.** `Code` takes `source`, `Markdown` takes `text`.
3. **Token rule.** No hook returns or injects text into the transcript or prompt, and
   `tool.call` results pass through unchanged. Modules never touch the model's context.
4. **The dock never breaks a session.** Every hook is wrapped in try/catch and ignores
   failures; a failing module shows its error in its own tab only.

Run `claude plugin validate .` after every change.

## Adding a built-in module

1. Create `hooks/modules/<name>.js` with the contract above (pure helpers go in `lib/util.js`).
2. Import it in `hooks/register.js` and add it to `BUILTIN`.
3. Add its id to `DEFAULT_TABS` if it should show by default. Prefer hiding clutter when
   a tab is empty over hiding the tab.
4. Test `render()` with a fake `el` (functions returning `{type, props}`) and a fake `ctx`,
   then try it in a session.
5. If the browser view should show it too, add an endpoint in `bin/session-dock` and a tab in
   `web/index.html` (read-only unless the data is meant to be edited there).

## Configuration

Two optional JSON files choose the tabs and their order:

- global: `~/.claude/session-dock/config.json`
- project: `<root>/.claude/dock.json` (when it has a `tabs` list it replaces the global one)

```json
{
  "tabs": [
    "overview", "plan", "sessions", "notes", "artifacts", "git",
    { "id": "todo", "title": "Todo", "file": "TODO.md" },
    { "id": "status", "title": "Status", "command": ["git", "status", "--short"] }
  ]
}
```

- A string is a built-in module: `overview`, `plan`, `sessions`, `agents`, `notes`, `artifacts`, `ports`, `card`, `git`.
- `{ id, title, file }` shows a Markdown file (relative to the project root, or absolute).
- `{ id, title, command }` shows the output of a command given as an argv array (no shell).
  **Command tabs are honoured only in the global config**, so a cloned repository cannot make
  the dock run anything.
- Without any config the tabs are `overview, plan, sessions, agents, notes, artifacts, ports, card, git`.
- With many tabs the bar can get wide: when the full titles exceed about 56 columns, inactive
  tabs show their `short` title (the active one always shows the full title), and the bar wraps
  if it still does not fit. Hotkeys `1`..`9` select the first nine tabs.
- The refresh interval is the plugin option `refreshSeconds` (default 15, minimum 5).

## Files

| Path | Content |
|---|---|
| `~/.claude/session-dock/sessions/<id>.json` | per-session state and last view |
| `~/.claude/session-dock/cmd/<id>.json` | commands for a running session, e.g. `{"reset": <ms>}` |
| `~/.claude/session-dock/notes/global.md` | global notes, `- [ ] text` per line |
| `~/.claude/session-dock/notes/projects/<slug>.md` | notes of one project (slug of its root path) |

State files older than a few weeks are not pruned automatically; delete them by hand.
