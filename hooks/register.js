// session-dock core: /sdock opens a pane of tabs, each tab a module (hooks/modules/).
// The pane docks beside the transcript (fullscreen, 110+ columns) or sits above the prompt.
//
// Token rule: no hook here returns text into the transcript or prompt. Tool results pass
// through unchanged; everything the dock learns goes to its own files.
//
// State lives per session in ~/.claude/session-dock/sessions/<session id>.json; nothing is
// written into projects. The tmux and browser views (bin/session-dock) read the same files.
import overview from './modules/overview.js'
import gitTab from './modules/git.js'
import sessions from './modules/sessions.js'
import { fileModule } from './modules/file.js'
import { commandModule } from './modules/command.js'

const PANE = 'session-dock'
const COMMAND = 'sdock'
const SAVE_EVERY_MS = 5000

const BUILTIN = {
  overview,
  sessions,
  card: fileModule({ id: 'card', title: 'Card', file: '.claude/dock.md' }),
  git: gitTab,
}
const DEFAULT_TABS = ['overview', 'sessions', 'card', 'git']

let options = {}

async function git($, root, args) {
  try {
    const r = await $.process.run(['git', ...args], { cwd: root, timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
}
let boot = null // init promise, once per load of this module (a hot reload starts over)
let ctx = null
let lastSaved = 0

function emptyView() {
  return { session: {}, usage: {}, git: {}, commits: [] }
}

async function readJson($, path) {
  try { return JSON.parse(await $.fs.read(path)) } catch { return null }
}

// Global config: ~/.claude/session-dock/config.json. Project config: <root>/.claude/dock.json.
// { "tabs": ["overview", "git", { "id": "todo", "title": "Todo", "file": "TODO.md" },
//            { "id": "status", "title": "Status", "command": ["purplectl", "project", "status"] }] }
// A project config may list built-in and file tabs; command tabs count only from the global one.
function buildTabs(globalConfig, projectConfig) {
  const fromProject = Array.isArray(projectConfig?.tabs)
  const list = (fromProject ? projectConfig.tabs : globalConfig?.tabs) || DEFAULT_TABS
  const tabs = []
  for (const entry of list) {
    if (typeof entry === 'string' && BUILTIN[entry]) tabs.push(BUILTIN[entry])
    else if (entry && typeof entry === 'object' && /^[\w-]{1,32}$/.test(entry.id || '')) {
      const title = String(entry.title || entry.id).slice(0, 20)
      if (typeof entry.file === 'string') tabs.push(fileModule({ id: entry.id, title, file: entry.file }))
      else if (!fromProject && Array.isArray(entry.command) && entry.command.length) tabs.push(commandModule({ id: entry.id, title, command: entry.command.map(String) }))
    }
  }
  return tabs.length ? tabs : DEFAULT_TABS.map((id) => BUILTIN[id])
}

async function init($) {
  const home = await $.env.get('HOME')
  const dir = home + '/.claude/session-dock'
  const root = await $.session.root()
  const sessionId = await $.session.id()
  const saved = await readJson($, dir + '/sessions/' + sessionId + '.json')
  const state = saved?.v === 2 && saved.state ? saved.state : { since: Date.now(), head: '', modules: {} }
  if (!state.head) state.head = (await git($, root, ['rev-parse', '--short', 'HEAD'])) || ''
  const tabs = buildTabs(await readJson($, dir + '/config.json'), await readJson($, root + '/.claude/dock.json'))

  ctx = {
    root, sessionId, dir, state, tabs,
    tab: tabs[0].id,
    view: emptyView(),
    busy: false,
    liveData: {},
    // Persistent per-session data of a module (saved with the session).
    data(id, make) {
      if (!state.modules[id]) state.modules[id] = make()
      return state.modules[id]
    },
    // Volatile data of a module (refilled by its load()).
    live(id) {
      if (!ctx.liveData[id]) ctx.liveData[id] = {}
      return ctx.liveData[id]
    },
  }

  try {
    await $.command.register({ name: COMMAND, description: 'Session dock: overview, digest since reset, more tabs', immediate: true })
  } catch { /* already registered in this load */ }

  // Timers touch git only while the pane is open; the command file lets the browser view press Reset.
  $.clock.every(Math.max(5, options.refreshSeconds || 15) * 1000, async () => {
    try {
      const cmdFile = dir + '/cmd/' + sessionId + '.json'
      if (await $.fs.exists(cmdFile)) {
        const cmd = await readJson($, cmdFile)
        await $.fs.write(cmdFile, '{}')
        if (cmd?.reset) await reset($)
      }
      if (await isOpen($)) await refresh($)
    } catch { /* next tick */ }
  })
  Object.assign(ctx, io($))
  return ctx
}

// What modules may do, as closures over this dispatch's $ (the plugin API never leaves this file).
function io($) {
  return {
    readFile: (path) => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: (path) => $.fs.exists(path),
    list: (path) => $.fs.list(path),
    run: (argv, timeoutMs = 15000) => $.process.run(argv, { cwd: ctx.root, timeoutMs }),
    reset: () => reset($),
    invalidate: () => $.ui.invalidate('ui.render'),
    refresh: () => refresh($),
  }
}

// Every hook calls this first: after a hot reload, session.start does not run again.
async function ensure($) {
  if (!boot) boot = init($).catch((error) => { boot = null; throw error })
  const c = await boot
  Object.assign(c, io($))
  return c
}

async function loadView($) {
  const root = ctx.root
  const usage = await $.session.usage()
  const branch = await git($, root, ['branch', '--show-current'])
  const head = await git($, root, ['rev-parse', '--short', 'HEAD'])
  const status = await git($, root, ['status', '--short'])
  const log = await git($, root, ['log', '--oneline', '-8'])
  const upstream = await git($, root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
  let commits = []
  if (ctx.state.head && head && ctx.state.head !== head) {
    const range = await git($, root, ['log', '--oneline', '-20', ctx.state.head + '..HEAD'])
    if (range) commits = range.split('\n')
  }
  const [behind, ahead] = upstream ? upstream.split(/\s+/).map(Number) : [undefined, undefined]
  const previous = ctx.view.session
  const info = await readJson($, (await $.env.get('HOME')) + '/.claude/sessions/' + (await sessionFile($)))
  ctx.view = {
    session: {
      id: ctx.sessionId, name: info?.name ?? previous.name, model: await $.session.model(), cwd: root,
      startedAt: usage.startedAt, turns: await $.session.turns(), busy: ctx.busy,
    },
    usage: {
      contextPercent: usage.context.percent, contextTokens: usage.context.tokens, contextWindow: usage.context.window,
      rateLimits: usage.rateLimits, costUsd: usage.cost?.usd,
    },
    git: branch === null ? {} : { branch, head, ahead, behind, dirty: (status || '').split('\n').filter(Boolean).length, status: status || '', log: log || '' },
    commits,
  }
}

// ~/.claude/sessions/<pid>.json carries the session's name; remember which file is ours.
let ownSessionFile = null
async function sessionFile($) {
  if (ownSessionFile) return ownSessionFile
  try {
    const home = await $.env.get('HOME')
    for (const entry of await $.fs.list(home + '/.claude/sessions')) {
      const name = String(entry.name)
      if (!name.endsWith('.json')) continue
      const info = await readJson($, home + '/.claude/sessions/' + name)
      if (info?.sessionId === ctx.sessionId) return (ownSessionFile = name)
    }
  } catch { /* no directory */ }
  return 'none'
}

async function save($, force) {
  const now = Date.now()
  if (!force && now - lastSaved < SAVE_EVERY_MS) return
  lastSaved = now
  try {
    const record = { v: 2, updatedAt: now, state: ctx.state, view: ctx.view }
    await $.fs.write(ctx.dir + '/sessions/' + ctx.sessionId + '.json', JSON.stringify(record, null, 1))
  } catch { /* the dock never breaks a session */ }
}

function dispatch(ev) {
  for (const module of ctx.tabs) {
    try { module.event?.(ctx, ev) } catch { /* a module never breaks a session */ }
  }
}

async function reset($) {
  ctx.state.since = Date.now()
  ctx.state.head = (await git($, ctx.root, ['rev-parse', '--short', 'HEAD'])) || ''
  dispatch({ type: 'reset' })
  await refresh($)
}

async function refresh($) {
  try { await loadView($) } catch { /* keep the last view */ }
  const active = ctx.tabs.find((m) => m.id === ctx.tab)
  try { await active?.load?.(ctx) } catch { /* module shows what it has */ }
  await save($, true)
  $.ui.invalidate('ui.render')
}

async function isOpen($) {
  return (await $.ui.panes()).some((pane) => pane.id === PANE)
}

export function register(on, userOptions) {
  options = userOptions

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try { await ensure($) } catch { /* the dock stays off */ }
    return result
  })

  on('turn.start', async ($, e, next) => {
    try {
      if (!e.agentId) {
        const c = await ensure($)
        c.busy = true
        c.view.session.busy = true
        if (await isOpen($)) c.invalidate()
      }
    } catch { /* ignore */ }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    try {
      if (!e.agentId) {
        await ensure($)
        dispatch({ type: 'tool', e, result })
        await save($, false)
      }
    } catch { /* ignore */ }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (!e.agentId) {
        await ensure($)
        ctx.busy = false
        await loadView($) // commits and usage are fresh at the end of each turn
        dispatch({ type: 'turn', e })
        await save($, true)
        if (await isOpen($)) ctx.invalidate()
      }
    } catch { /* ignore */ }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try { if (ctx) await save($, true) } catch { /* ignore */ }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const c = await ensure($)
    const arg = e.args.trim()
    if (arg === 'close') { await $.ui.close({ id: PANE }); return {} }
    if (arg === 'reset') { await reset($); return {} }
    if (c.tabs.some((m) => m.id === arg)) c.tab = arg
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Dock', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE || !ctx) return next(e)
    Object.assign(ctx, io($))
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const tabs = ctx.tabs.map((m, i) =>
      Button({
        key: 'tab-' + m.id, label: m.title, hotkey: i < 9 ? String(i + 1) : undefined, plain: true, dimColor: ctx.tab !== m.id,
        onPress: () => { ctx.tab = m.id; refresh($) },
      }))
    const active = ctx.tabs.find((m) => m.id === ctx.tab) || ctx.tabs[0]
    let body
    try {
      body = active.render(ctx, el, e)
    } catch (error) {
      body = [Text({ key: 'error', color: 'red', children: [active.id + ': ' + String(error)] })]
    }
    return Box({
      flexDirection: 'column',
      children: [
        Box({ key: 'tabs', flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [...tabs, Button({ key: 'reload', label: '↻', hotkey: 'r', plain: true, dimColor: true, onPress: () => refresh($) })] }),
        Text({ key: 'gap', children: [' '] }),
        ...body,
      ],
    })
  })
}
