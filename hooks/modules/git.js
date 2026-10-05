// Git: pick a repository at or below the session root and look at it as status, graph or branches.
// The overview and digest keep using the session root's repository (ctx.view.git).
import { ago, basename, plural, spacer } from '../lib/util.js'

const MAX_REPOS = 150
const PICK_PAGE = 15
const DISCOVER_TTL_MS = 3 * 60 * 1000
const GRAPH_ROWS = 60
const MAX_FILES = 40
const MAX_BRANCHES = 40
const VIEWS = [
  { id: 'status', label: 'Status', hotkey: 's' },
  { id: 'graph', label: 'Graph', hotkey: 'g' },
  { id: 'branches', label: 'Branches', hotkey: 'b' },
]
// Graph columns cycle through these (Ink colour names).
const PALETTE = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']

async function git(ctx, cwd, args, timeoutMs = 8000) {
  try {
    const r = await ctx.run(['git', ...args], timeoutMs, cwd)
    return r.exitCode === 0 ? r.stdout.replace(/\s+$/, '') : null
  } catch {
    return null
  }
}

function relative(root, path) {
  if (path === root) return '.'
  if (path.startsWith(root + '/')) return path.slice(root.length + 1)
  return basename(path) + ' (outside root)'
}

// Branch of a repository without spawning git: .git/HEAD, or for a worktree the HEAD in the
// directory its .git file points to.
async function readBranch(ctx, repo) {
  try {
    let gitDir = repo.path + '/.git'
    if (repo.worktree) {
      const m = (await ctx.readFile(gitDir)).match(/^gitdir: (.+)$/m)
      if (!m) return null
      gitDir = m[1].startsWith('/') ? m[1].trim() : repo.path + '/' + m[1].trim()
    }
    const head = (await ctx.readFile(gitDir + '/HEAD')).trim()
    const m = head.match(/^ref: refs\/heads\/(.+)$/)
    return m ? m[1] : 'detached ' + head.slice(0, 7)
  } catch {
    return null
  }
}

// One find, no git per repository: discovery stays fast with a hundred repositories.
async function discover(ctx) {
  const found = new Map() // path -> { path, worktree, mtime }
  const top = await git(ctx, ctx.root, ['rev-parse', '--show-toplevel'])
  if (top) found.set(top, { path: top, worktree: false, mtime: Infinity })
  try {
    const r = await ctx.run(['find', ctx.root, '-maxdepth', '3', '-name', 'node_modules', '-prune', '-o', '-name', '.git', '-printf', '%y %T@ %p\n'], 10000)
    for (const line of r.stdout.split('\n')) {
      const m = line.match(/^([df]) ([\d.]+) (.+)\/\.git$/)
      if (m && !found.has(m[3])) found.set(m[3], { path: m[3], worktree: m[1] === 'f', mtime: Number(m[2]) })
    }
  } catch { /* keep what we have */ }
  let repos = [...found.values()].sort((a, b) => (a.path === top ? -1 : b.path === top ? 1 : a.path.localeCompare(b.path))).slice(0, MAX_REPOS)
  for (const repo of repos) {
    repo.branch = await readBranch(ctx, repo)
    repo.rel = relative(ctx.root, repo.path)
  }
  repos = repos.filter((repo) => repo.branch) // drops stray .git entries that are no repository
  // Default: the repository containing the root, else the most recently touched one.
  const newest = repos.reduce((best, r) => (!best || r.mtime > best.mtime ? r : best), null)
  return { repos, fallback: top || newest?.path || '' }
}

function branchLabel(repo) {
  return repo.rel + ' · ' + repo.branch + (repo.worktree ? ' · worktree' : '')
}

// ---- views -----------------------------------------------------------------------------

async function loadStatus(ctx, cwd) {
  const out = await git(ctx, cwd, ['status', '--porcelain=v1', '-b'])
  if (out === null) return null
  const lines = out.split('\n')
  const head = (lines.shift() || '').replace(/^## /, '')
  const m = head.match(/^(.*?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/)
  const track = m?.[3] || ''
  const stash = await git(ctx, cwd, ['stash', 'list'])
  return {
    branch: (m?.[1] || head).replace(/^No commits yet on /, ''),
    upstream: m?.[2] || '',
    ahead: Number(track.match(/ahead (\d+)/)?.[1] || 0),
    behind: Number(track.match(/behind (\d+)/)?.[1] || 0),
    gone: /gone/.test(track),
    files: lines.filter(Boolean),
    stash: stash ? stash.split('\n').length : 0,
  }
}

function renderStatus(ctx, el, s) {
  if (!s) return [el.Text({ key: 'none', dimColor: true, children: ['Not a git repository.'] })]
  const files = s.files.slice(0, MAX_FILES).map((line, i) => {
    const code = line.slice(0, 2)
    const color = code === '??' ? 'gray' : /[UD]/.test(code) ? 'red' : code[0] !== ' ' ? 'green' : 'yellow'
    return el.Box({ key: 'f-' + i, flexDirection: 'row', columnGap: 1, children: [
      el.Text({ color, children: [code] }),
      el.Text({ children: [line.slice(3)] }),
    ] })
  })
  const sync = s.gone ? 'upstream gone' : !s.upstream ? 'no upstream' : s.ahead || s.behind ? '↑' + s.ahead + ' ↓' + s.behind : 'in sync'
  return [
    el.Box({ key: 'head', flexDirection: 'row', columnGap: 1, children: [
      el.Text({ bold: true, color: 'cyan', children: [s.branch] }),
      el.Text({ dimColor: true, children: [s.upstream ? '→ ' + s.upstream : ''] }),
      el.Text({ color: s.ahead || s.behind ? 'yellow' : 'green', children: [sync] }),
    ] }),
    el.Text({ key: 'counts', dimColor: true, children: [plural(s.files.length, 'changed file') + ' · ' + s.stash + (s.stash === 1 ? ' stash entry' : ' stash entries')] }),
    spacer(el, 'gap1'),
    ...(files.length ? files : [el.Text({ key: 'clean', color: 'green', children: ['working tree clean'] })]),
    ...(s.files.length > MAX_FILES ? [el.Text({ key: 'more', dimColor: true, children: ['… ' + (s.files.length - MAX_FILES) + ' more'] })] : []),
  ]
}

async function loadGraph(ctx, cwd) {
  const out = await git(ctx, cwd, ['log', '--graph', '--all', '--decorate', '--oneline', '--color=never', '-n', String(GRAPH_ROWS)])
  return out === null ? null : out.split('\n')
}

// One graph line -> { graph: [{ text, color }], hash, refs: [..], subject }.
export function parseGraphLine(line) {
  const prefix = line.match(/^[*|\\/_. ]*/)[0]
  const rest = line.slice(prefix.length)
  const pieces = []
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i]
    const color = ch === ' ' || ch === '.' ? undefined : PALETTE[Math.floor(i / 2) % PALETTE.length]
    const last = pieces[pieces.length - 1]
    if (last && last.color === color) last.text += ch
    else pieces.push({ text: ch, color })
  }
  const m = rest.match(/^([0-9a-f]{7,40})(?: \(([^)]*)\))? ?(.*)$/)
  if (!m) return { graph: pieces, hash: '', refs: [], subject: rest }
  return { graph: pieces, hash: m[1], refs: m[2] ? m[2].split(', ') : [], subject: m[3] }
}

function refStyle(ref) {
  if (ref.startsWith('HEAD')) return { color: 'cyan', bold: true }
  if (ref.startsWith('tag: ')) return { color: 'yellow', bold: true }
  if (ref.includes('/')) return { color: 'red', bold: true }
  return { color: 'green', bold: true }
}

function renderGraph(ctx, el, lines) {
  if (!lines) return [el.Text({ key: 'none', dimColor: true, children: ['Not a git repository.'] })]
  return lines.map((line, i) => {
    const row = parseGraphLine(line)
    const kids = row.graph.map((p, j) => el.Text({ key: 'g' + j, color: p.color, bold: !!p.color, children: [p.text] }))
    if (row.hash) kids.push(el.Text({ key: 'h', dimColor: true, children: [' ' + row.hash + ' '] }))
    if (row.refs.length) {
      kids.push(el.Text({ key: 'ro', dimColor: true, children: ['('] }))
      row.refs.forEach((ref, j) => {
        const [first, second] = ref.split(' -> ')
        if (second === undefined) kids.push(el.Text({ key: 'r' + j, ...refStyle(ref), children: [ref] }))
        else {
          kids.push(el.Text({ key: 'r' + j, ...refStyle('HEAD'), children: [first + ' → '] }))
          kids.push(el.Text({ key: 'rb' + j, ...refStyle(second), children: [second] }))
        }
        if (j < row.refs.length - 1) kids.push(el.Text({ key: 'rc' + j, dimColor: true, children: [', '] }))
      })
      kids.push(el.Text({ key: 'rx', dimColor: true, children: [') '] }))
    }
    if (row.subject) kids.push(el.Text({ key: 's', children: [row.subject] }))
    return el.Box({ key: 'row-' + i, flexDirection: 'row', children: kids })
  })
}

async function loadBranches(ctx, cwd) {
  const fmt = '%(HEAD)|%(refname:short)|%(committerdate:unix)|%(upstream:short)|%(upstream:track)'
  const out = await git(ctx, cwd, ['for-each-ref', '--sort=-committerdate', '--format=' + fmt, 'refs/heads'])
  if (out === null) return null
  const rows = out.split('\n').filter(Boolean).map((line) => {
    const [head, name, at, upstream, track] = line.split('|')
    return { current: head === '*', name, at: Number(at) * 1000, upstream, track: track.replace(/[[\]]/g, '') }
  })
  const names = rows.map((r) => r.name)
  let base = (await git(ctx, cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.replace(/^origin\//, '')
  if (!base || !names.includes(base)) base = ['main', 'master', 'trunk', 'develop'].find((n) => names.includes(n)) || rows.find((r) => r.current)?.name
  const merged = base ? await git(ctx, cwd, ['branch', '--merged', base, '--format=%(refname:short)']) : null
  return { rows, base, merged: new Set((merged || '').split('\n').filter(Boolean)) }
}

function renderBranches(ctx, el, b) {
  if (!b) return [el.Text({ key: 'none', dimColor: true, children: ['Not a git repository.'] })]
  const w = Math.min(32, Math.max(8, ...b.rows.map((r) => r.name.length)))
  const rows = b.rows.slice(0, MAX_BRANCHES).map((r, i) => {
    const isBase = r.name === b.base
    const merged = b.merged.has(r.name)
    return el.Box({ key: 'b-' + i, flexDirection: 'row', columnGap: 1, children: [
      el.Text({ color: 'cyan', children: [r.current ? '*' : ' '] }),
      el.Text({ bold: r.current, children: [r.name.slice(0, w).padEnd(w)] }),
      el.Text({ dimColor: true, children: [ago(Date.now() - r.at).padEnd(10)] }),
      el.Text({ color: r.track ? 'yellow' : undefined, dimColor: !r.track, children: [(r.track || (r.upstream ? 'in sync' : 'local only')).padEnd(18)] }),
      el.Text({ color: isBase ? 'cyan' : merged ? 'green' : 'yellow', children: [isBase ? 'default' : merged ? 'merged' : 'unmerged'] }),
    ] })
  })
  return [
    el.Text({ key: 'base', dimColor: true, children: ['merged into ' + (b.base || '?') + ' · ' + b.rows.length + (b.rows.length === 1 ? ' local branch' : ' local branches')] }),
    spacer(el, 'gap1'),
    ...rows,
  ]
}

// ---- module ----------------------------------------------------------------------------

const LOADERS = { status: loadStatus, graph: loadGraph, branches: loadBranches }
const RENDERERS = { status: renderStatus, graph: renderGraph, branches: renderBranches }

function selected(ctx, d, live) {
  const repos = live.repos || []
  return repos.find((r) => r.path === d.repo)?.path || live.fallback || (repos[0] && repos[0].path) || ctx.root
}

export default {
  id: 'git',
  title: 'Git',
  help: {
    about: 'Git repositories at and below the session root: pick one, then look at its status, commit graph or branches. The overview keeps showing the session root’s repository.',
    keys: [
      's  status: branch, ahead/behind, changed files, stashes',
      'g  graph: git log --graph of all branches (60 commits)',
      'b  branches: age, ahead/behind upstream, merged into the default branch',
      'f  rescan for repositories (otherwise every 3 minutes)',
      'o  open the repository list (n: next page), Tab/Enter or click to choose; kept per session',
    ],
  },

  async load(ctx) {
    const d = ctx.data('git', () => ({ repo: '', view: 'status' }))
    const live = ctx.live('git')
    if (!live.repos || Date.now() - (live.discoveredAt || 0) > DISCOVER_TTL_MS || live.rescan) {
      live.rescan = false
      Object.assign(live, await discover(ctx), { discoveredAt: Date.now() })
    }
    const cwd = selected(ctx, d, live)
    live.cwd = cwd
    live.shown = d.view
    live.data = { [d.view]: await LOADERS[d.view](ctx, cwd) }
  },

  render(ctx, el) {
    const d = ctx.data('git', () => ({ repo: '', view: 'status' }))
    const live = ctx.live('git')
    const repos = live.repos || []
    // Own picker instead of Select (suspected of crashing the pane): a toggle and a page of buttons.
    const current = repos.find((r) => r.path === selected(ctx, d, live))
    const picker = []
    if (repos.length) {
      picker.push(el.Button({
        key: 'pick', label: '⎇ ' + (current ? branchLabel(current) : 'choose repository') + (live.picking ? ' ▴' : ' ▾'), hotkey: 'o', plain: true,
        onPress: () => { live.picking = !live.picking; live.page = 0; ctx.invalidate() },
      }))
      if (live.picking) {
        const page = live.page || 0
        const shown = repos.slice(page * PICK_PAGE, (page + 1) * PICK_PAGE)
        shown.forEach((r) => picker.push(el.Button({
          key: 'repo-' + r.path, label: (r.path === current?.path ? '▸ ' : '  ') + branchLabel(r), plain: true, dimColor: r.path !== current?.path,
          onPress: () => { d.repo = r.path; live.picking = false; ctx.refresh() },
        })))
        if (repos.length > PICK_PAGE) picker.push(el.Button({
          key: 'repo-next', label: '  more… (' + (page + 1) + '/' + Math.ceil(repos.length / PICK_PAGE) + ')', hotkey: 'n', plain: true, dimColor: true,
          onPress: () => { live.page = (page + 1) % Math.ceil(repos.length / PICK_PAGE); ctx.invalidate() },
        }))
      }
    }
    const buttons = VIEWS.map((v) => el.Button({
      key: 'view-' + v.id, label: v.label, hotkey: v.hotkey, plain: true, dimColor: d.view !== v.id,
      onPress: () => { d.view = v.id; ctx.refresh() },
    }))
    buttons.push(el.Button({ key: 'rescan', label: 'rescan', hotkey: 'f', plain: true, dimColor: true, onPress: () => { live.rescan = true; ctx.refresh() } }))
    const body = live.shown === d.view && live.data ? RENDERERS[d.view](ctx, el, live.data[d.view]) : [el.Text({ key: 'loading', dimColor: true, children: ['loading…'] })]
    return [
      ...picker,
      el.Box({ key: 'views', flexDirection: 'row', columnGap: 2, children: buttons }),
      spacer(el, 'gap'),
      ...body,
    ]
  },
}
