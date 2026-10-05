// Overview: who and where this session is, how full its context and limits are,
// and the "since you were away" digest with its reset button.
import { planSummary } from './plan.js'
import { ALARM, ago, heading, limitLabel, meter, plural, sparkline, spacer } from '../lib/util.js'

const HISTORY_MAX = 40
const MAX_FILES = 200
const TEST_RE = /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bpytest\b|\bcargo\s+test\b|\bgo\s+test\b|\bvitest\b|\bjest\b|\bnode\s+--test\b/

function fresh() {
  return { turns: 0, workMs: 0, files: [], commands: 0, tests: 0, agents: 0, pushes: 0 }
}

export default {
  id: 'overview',
  title: 'Overview',

  event(ctx, ev) {
    const d = ctx.data('overview', () => ({ away: fresh(), history: [] }))
    if (ev.type === 'reset') d.away = fresh()
    else if (ev.type === 'turn') {
      d.away.turns++
      d.away.workMs += ev.e.durationMs || 0
      const p = ctx.view.usage.contextPercent
      if (typeof p === 'number') d.history = [...d.history, Math.round(p)].slice(-HISTORY_MAX)
    } else if (ev.type === 'tool') {
      const e = ev.e
      const a = d.away
      if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.tool)) {
        const file = String(e.file_path || e.notebook_path || '').replace(ctx.root + '/', '')
        if (file && !a.files.includes(file) && a.files.length < MAX_FILES) a.files.push(file)
      } else if (e.tool === 'Bash') {
        const command = String(e.command || '')
        a.commands++
        if (TEST_RE.test(command)) a.tests++
        if (/\bgit\s+push\b/.test(command)) a.pushes++
      } else if (e.tool === 'Agent' || e.tool === 'Task') {
        a.agents++
      }
    }
  },

  render(ctx, el) {
    const { session: s, usage: u, git: g } = ctx.view
    const d = ctx.data('overview', () => ({ away: fresh(), history: [] }))
    const a = d.away
    const out = []

    const dot = s.busy ? { color: 'yellow', text: '● working' } : { color: 'green', text: '● idle' }
    out.push(el.Box({
      key: 'head', flexDirection: 'row', columnGap: 2,
      children: [el.Text({ color: dot.color, children: [dot.text] }), el.Text({ bold: true, children: [s.name || 'session'] }), el.Text({ dimColor: true, children: [s.model || ''] })],
    }))
    if (g.branch !== undefined && g.branch !== null) {
      const sync = g.ahead || g.behind ? ' ↑' + (g.ahead || 0) + ' ↓' + (g.behind || 0) : ''
      out.push(el.Text({ key: 'branch', children: ['⎇ ' + (g.branch || 'detached') + sync + ' · ' + (g.dirty ? g.dirty + ' uncommitted' : 'clean')] }))
    } else {
      out.push(el.Text({ key: 'branch', dimColor: true, children: ['no git repository'] }))
    }

    const plan = planSummary(ctx)
    if (plan) out.push(el.Text({ key: 'plan', color: 'cyan', children: ['☰ ' + plan] }))

    const hot = [['context', u.contextPercent], ...(u.rateLimits || []).map((r) => [limitLabel(r.kind), r.percentUsed])].filter(([, p]) => p >= ALARM)
    if (hot.length) {
      const hint = hot[0][0] === 'context' ? ' — consider /compact ' : ' '
      out.push(el.Text({ key: 'alarm', color: 'red', bold: true, inverse: true, children: [' ⚠ ' + hot.map(([l, p]) => l + ' ' + Math.round(p) + '%').join(' · ') + hint] }))
    }

    out.push(spacer(el, 's1'))
    out.push(meter(el, 'm-context', 'context', u.contextPercent))
    for (const r of u.rateLimits || []) out.push(meter(el, 'm-' + r.kind, limitLabel(r.kind), r.percentUsed))
    const spark = sparkline(d.history)
    if (spark) out.push(el.Box({ key: 'spark', flexDirection: 'row', columnGap: 1, children: [el.Text({ dimColor: true, children: ['trend   '] }), el.Text({ color: 'cyan', children: [spark] })] }))
    if (u.costUsd !== undefined) out.push(el.Text({ key: 'cost', dimColor: true, children: ['cost     $' + u.costUsd.toFixed(2)] }))

    out.push(spacer(el, 's2'))
    out.push(el.Box({
      key: 'away-head', flexDirection: 'row', columnGap: 2,
      children: [
        heading(el, 'away-title', 'Since you were away'),
        el.Text({ dimColor: true, children: [ctx.state.since ? ago(Date.now() - ctx.state.since) : ''] }),
        el.Button({ key: 'reset', label: '⟲ Reset', hotkey: 'x', plain: true, onPress: () => ctx.reset() }),
      ],
    }))
    const bullets = []
    if (!a.turns && !a.commands && !a.files.length && !ctx.view.commits.length) bullets.push('nothing yet')
    else {
      bullets.push(plural(a.turns, 'turn') + ', ' + Math.round(a.workMs / 60000) + ' min of work')
      if (ctx.view.commits.length) bullets.push(plural(ctx.view.commits.length, 'commit') + (a.pushes ? ', pushed' : ''))
      for (const c of ctx.view.commits.slice(0, 5)) bullets.push('   ' + c.slice(0, 72))
      if (a.files.length) bullets.push(plural(a.files.length, 'file') + ' edited: ' + a.files.slice(-5).join(', '))
      if (a.tests) bullets.push('tests run ' + a.tests + '×')
      if (a.agents) bullets.push(plural(a.agents, 'subagent') + ' started')
    }
    bullets.forEach((b, i) => out.push(el.Text({ key: 'b' + i, dimColor: b.startsWith('   '), children: [b.startsWith('   ') ? b : '• ' + b] })))
    return out
  },
}
