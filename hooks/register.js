// session-dock: /sdock opens an overview pane (docked beside the transcript, or above the prompt on narrow terminals).
//   Overview: model, context, usage, git, and a digest of what happened since the last reset.
//   Card:     the project's .claude/dock.md, rendered.   Git: branch, status, recent commits.
// The digest is built from tool and turn events and from Git; the model writes nothing into it.
const PANE = 'session-dock'
const MAX_CHARS = 9500 // Markdown and Code elements take at most 10,000 characters
const STATE_FILE = '.claude/dock-state.json'
const CMD_FILE = '.claude/dock-cmd.json'
const TEST_RE = /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bpytest\b|\bcargo\s+test\b|\bgo\s+test\b|\bvitest\b|\bjest\b|\bnode\s+--test\b/
const MAX_FILES = 200

let options = {}
let tab = 'overview'
let root = ''
let digest = freshDigest(0, '')
let view = { session: {}, usage: {}, git: {}, card: '', cardPath: '', commits: [], updated: '' }
let lastSaved = 0

function freshDigest(since, head) {
  return { since, head, turns: 0, workMs: 0, files: {}, commands: 0, tests: 0, agents: 0, notes: [] }
}

function clip(text) {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n\n… (cut off)' : text
}

function absolute(path) {
  return path.startsWith('/') ? path : root + '/' + path
}

function bar(percent, width = 20) {
  const p = Math.max(0, Math.min(100, Math.round(percent ?? 0)))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ' ' + p + '%'
}

function ago(ms) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 6) / 10
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' d ago'
}

async function git($, args) {
  try {
    const r = await $.process.run(['git', ...args], { cwd: root, timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
}

async function sessionName($, id) {
  // Best effort: ~/.claude/sessions/<pid>.json carries the session's name.
  try {
    const home = await $.env.get('HOME')
    if (!home) return undefined
    for (const entry of await $.fs.list(home + '/.claude/sessions')) {
      if (!String(entry.name).endsWith('.json')) continue
      try {
        const info = JSON.parse(await $.fs.read(home + '/.claude/sessions/' + entry.name))
        if (info.sessionId === id) return info.name
      } catch { /* next */ }
    }
  } catch { /* directory missing */ }
  return undefined
}

async function load($) {
  root = await $.session.root()
  const id = await $.session.id()
  const usage = await $.session.usage()
  const branch = await git($, ['branch', '--show-current'])
  const head = await git($, ['rev-parse', '--short', 'HEAD'])
  const status = await git($, ['status', '--short'])
  const log = await git($, ['log', '--oneline', '-8'])
  const upstream = await git($, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
  let commits = []
  if (digest.head && head && digest.head !== head) {
    const range = await git($, ['log', '--oneline', '-20', digest.head + '..HEAD'])
    if (range) commits = range.split('\n')
  }

  let card = ''
  const cardPath = absolute(options.cardFile || '.claude/dock.md')
  try { card = await $.fs.read(cardPath) } catch { /* no card */ }

  const [behind, ahead] = upstream ? upstream.split(/\s+/).map(Number) : [undefined, undefined]
  view = {
    session: {
      id, name: await sessionName($, id), model: await $.session.model(), cwd: root,
      startedAt: usage.startedAt, turns: await $.session.turns(),
    },
    usage: {
      contextPercent: usage.context.percent, contextTokens: usage.context.tokens, contextWindow: usage.context.window,
      rateLimits: usage.rateLimits, costUsd: usage.cost?.usd,
    },
    git: { branch, head, ahead, behind, dirty: (status || '').split('\n').filter(Boolean).length, status: status || '', log: log || '' },
    card, cardPath, commits, updated: new Date().toLocaleTimeString(),
  }
}

async function persist($, force) {
  const now = Date.now()
  if (!force && now - lastSaved < 5000) return
  lastSaved = now
  try {
    await $.store.set('digest:' + root, digest)
    if (options.writeState !== false && root) {
      const model = { v: 1, updatedAt: now, ...view, digest: { ...digest, files: Object.keys(digest.files) } }
      await $.fs.write(absolute(STATE_FILE), JSON.stringify(model, null, 2))
    }
  } catch { /* the dock never breaks a session */ }
}

async function reset($) {
  const head = await git($, ['rev-parse', '--short', 'HEAD'])
  digest = freshDigest(Date.now(), head || '')
  await load($)
  await persist($, true)
  $.ui.invalidate('ui.render')
}

async function refresh($) {
  try { await load($) } catch (error) { view = { ...view, updated: 'load failed: ' + String(error) } }
  await persist($, true)
  $.ui.invalidate('ui.render')
}

async function isOpen($) {
  return (await $.ui.panes()).some((pane) => pane.id === PANE)
}

function track(e) {
  const tool = e.tool
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const file = e.file_path || e.notebook_path
    if (file && Object.keys(digest.files).length < MAX_FILES) digest.files[String(file).replace(root + '/', '')] = true
  } else if (tool === 'Bash') {
    const command = String(e.command || '')
    digest.commands++
    if (TEST_RE.test(command)) digest.tests++
    if (/\bgit\s+push\b/.test(command)) digest.notes.push('git push at ' + new Date().toLocaleTimeString())
  } else if (tool === 'Agent' || tool === 'Task') {
    digest.agents++
  }
  if (digest.notes.length > 20) digest.notes = digest.notes.slice(-20)
}

function overviewMarkdown() {
  const { session: s, usage: u, git: g } = view
  const lines = []
  lines.push('**' + (s.name || 'session') + '** · `' + (s.model || '?') + '`')
  if (g.branch !== undefined && g.branch !== null) {
    const sync = g.ahead || g.behind ? ' (↑' + (g.ahead || 0) + ' ↓' + (g.behind || 0) + ')' : ''
    lines.push('branch `' + (g.branch || 'detached') + '`' + sync + ' · ' + (g.dirty ? g.dirty + ' uncommitted' : 'clean'))
  }
  lines.push('')
  lines.push('```')
  lines.push('context ' + bar(u.contextPercent))
  for (const limit of u.rateLimits || []) lines.push(({ five_hour: '5h', seven_day: '7d' }[limit.kind] || String(limit.kind).slice(0, 7)).padEnd(8) + bar(limit.percentUsed))
  if (u.costUsd !== undefined) lines.push('cost    $' + u.costUsd.toFixed(2))
  lines.push('```')
  return lines.join('\n')
}

function digestMarkdown() {
  const files = Object.keys(digest.files)
  const lines = []
  lines.push('*since ' + (digest.since ? ago(Date.now() - digest.since) : 'session start') + '*')
  lines.push('')
  if (!digest.turns && !digest.commands && !files.length && !view.commits.length) {
    lines.push('- nothing yet')
    return lines.join('\n')
  }
  lines.push('- ' + digest.turns + ' turns, ' + Math.round(digest.workMs / 60000) + ' min of work')
  if (view.commits.length) {
    lines.push('- ' + view.commits.length + ' commit' + (view.commits.length > 1 ? 's' : ''))
    for (const c of view.commits.slice(0, 5)) lines.push('  - `' + c.slice(0, 70) + '`')
  }
  if (files.length) lines.push('- ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' edited: ' + files.slice(-6).map((f) => '`' + f + '`').join(', '))
  if (digest.tests) lines.push('- tests run ' + digest.tests + '×')
  if (digest.agents) lines.push('- ' + digest.agents + ' subagent' + (digest.agents > 1 ? 's' : '') + ' started')
  for (const note of digest.notes.slice(-5)) lines.push('- ' + note)
  return lines.join('\n')
}

export function register(on, userOptions) {
  options = userOptions

  on('session.start', async ($, e, next) => {
    try {
      root = await $.session.root()
      const saved = await $.store.get('digest:' + root)
      if (saved && typeof saved === 'object') digest = { ...freshDigest(0, ''), ...saved }
      else digest = freshDigest(Date.now(), (await git($, ['rev-parse', '--short', 'HEAD'])) || '')
    } catch { /* start empty */ }
    // Timers touch git only while the pane is open; the command file lets the browser dock press Reset.
    $.clock.every(Math.max(5, options.refreshSeconds || 15) * 1000, async () => {
      try {
        if (options.writeState !== false && root && (await $.fs.exists(absolute(CMD_FILE)))) {
          const cmd = JSON.parse(await $.fs.read(absolute(CMD_FILE)))
          await $.fs.write(absolute(CMD_FILE), '{}')
          if (cmd.reset) await reset($)
        }
        if (await isOpen($)) await refresh($)
      } catch { /* next tick */ }
    })
    await $.command.register({ name: 'sdock', description: 'Session overview pane (usage, git, digest since reset)', immediate: true })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    try { if (!e.agentId) track(e); await persist($, false) } catch { /* ignore */ }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (!e.agentId) {
        digest.turns++
        digest.workMs += e.durationMs || 0
        await load($) // commits and usage are fresh at the end of each turn
        await persist($, true)
        if (await isOpen($)) $.ui.invalidate('ui.render')
      }
    } catch { /* ignore */ }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try { await persist($, true) } catch { /* ignore */ }
    return next(e)
  })

  on('command.run', { command: 'sdock' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close') { await $.ui.close({ id: PANE }); return {} }
    if (arg === 'reset') { await reset($); return {} }
    await load($)
    await persist($, true)
    await $.ui.open({ id: PANE, title: 'Dock', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Markdown, Code } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const tabButton = (name, label, hotkey) =>
      Button({ key: 'tab-' + name, label, hotkey, plain: true, dimColor: tab !== name, onPress: () => { tab = name; redraw() } })

    let body
    if (tab === 'overview') {
      body = [
        Markdown({ key: 'overview', text: overviewMarkdown() }),
        Text({ children: [' '] }),
        Box({
          flexDirection: 'row', columnGap: 2,
          children: [
            Text({ bold: true, children: ['Since you were away'] }),
            Button({ key: 'reset', label: '⟲ Reset', hotkey: 'x', plain: true, onPress: () => reset($) }),
          ],
        }),
        Markdown({ key: 'digest', text: clip(digestMarkdown()) }),
      ]
    } else if (tab === 'card') {
      body = view.card
        ? [Text({ dimColor: true, children: [view.cardPath] }), Markdown({ key: 'card', text: clip(view.card) })]
        : [Text({ children: ['No card at ' + (options.cardFile || '.claude/dock.md') + '.'] })]
    } else {
      body = [Code({ source: clip((view.git.status || 'working tree clean') + '\n\n' + (view.git.log || '')) })]
    }

    return Box({
      flexDirection: 'column',
      children: [
        Box({
          flexDirection: 'row', columnGap: 3,
          children: [
            tabButton('overview', 'Overview', '1'), tabButton('card', 'Card', '2'), tabButton('git', 'Git', '3'),
            Button({ key: 'reload', label: 'Reload', hotkey: 'r', plain: true, onPress: () => refresh($) }),
          ],
        }),
        Text({ children: [' '] }),
        ...body,
      ],
    })
  })
}
