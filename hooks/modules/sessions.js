// Sessions: one compact row per recently active Claude Code session on this machine.
// Dock state files (<dir>/sessions/*.json) are joined with Claude Code's own live session
// files (~/.claude/sessions/*.json, which carry the name and busy/idle/waiting status).
import { ago, basename, shortModel } from '../lib/util.js'

const WINDOW_MS = 24 * 3600 * 1000
const MAX_ROWS = 40
const DOT = { busy: 'yellow', idle: 'green', waiting: 'red', gone: undefined }
const ORDER = { busy: 0, waiting: 0, idle: 1, gone: 2 }

async function readJson(ctx, path) {
  try { return JSON.parse(await ctx.readFile(path)) } catch { return null }
}

export default {
  id: 'sessions',
  title: 'Sessions',

  async load(ctx) {
    const d = ctx.live('sessions')
    const now = Date.now()
    const live = new Map()
    const claudeDir = ctx.dir.replace(/\/[^/]+\/?$/, '') // ~/.claude
    try {
      for (const entry of await ctx.list(claudeDir + '/sessions')) {
        if (!String(entry.name).endsWith('.json')) continue
        const info = await readJson(ctx, claudeDir + '/sessions/' + entry.name)
        if (info?.sessionId) live.set(info.sessionId, info)
      }
    } catch { /* no live sessions directory */ }

    const rows = []
    try {
      const files = (await ctx.list(ctx.dir + '/sessions'))
        .filter((f) => String(f.name).endsWith('.json') && now - f.mtimeMs < WINDOW_MS)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, MAX_ROWS)
      for (const f of files) {
        const rec = await readJson(ctx, ctx.dir + '/sessions/' + f.name)
        if (!rec || rec.v !== 2 || !rec.view?.session) continue
        const view = rec.view.session.id === ctx.sessionId ? ctx.view : rec.view
        const s = view.session
        const id = s.id || f.name.replace(/\.json$/, '')
        const info = live.get(id)
        const status = info ? (['busy', 'idle', 'waiting'].includes(info.status) ? info.status : 'idle') : 'gone'
        rows.push({
          id, status,
          name: info?.name || s.name || id.slice(0, 8),
          project: basename(s.cwd),
          model: shortModel(s.model),
          context: view.usage?.contextPercent,
          branch: view.git?.branch,
          updatedAt: Math.max(rec.updatedAt || 0, info?.updatedAt || 0, f.mtimeMs),
        })
      }
    } catch { /* no state directory yet */ }
    rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt)
    d.rows = rows
    d.loadedAt = now
  },

  render(ctx, el) {
    const rows = ctx.live('sessions').rows
    if (!rows) return [el.Text({ key: 'wait', dimColor: true, children: ['loading…'] })]
    if (!rows.length) return [el.Text({ key: 'none', dimColor: true, children: ['No session active in the last 24 hours.'] })]
    const now = Date.now()
    return rows.map((r) => {
      const current = r.id === ctx.sessionId
      const dim = r.status === 'gone'
      return el.Box({
        key: 'row-' + r.id, flexDirection: 'row', columnGap: 2,
        children: [
          el.Text({ key: 'dot', color: DOT[r.status], dimColor: dim, children: ['●'] }),
          el.Text({ key: 'name', bold: current, dimColor: dim, children: [(current ? '▸ ' : '') + r.name] }),
          el.Text({ key: 'project', color: 'cyan', dimColor: dim, children: [r.project] }),
          el.Text({ key: 'model', dimColor: true, children: [r.model] }),
          el.Text({ key: 'ctx', dimColor: true, children: [typeof r.context === 'number' ? Math.round(r.context) + '%' : '–'] }),
          el.Text({ key: 'branch', dimColor: true, children: [r.branch ? '⎇ ' + r.branch : ''] }),
          el.Text({ key: 'ago', dimColor: true, children: [ago(now - r.updatedAt)] }),
        ],
      })
    })
  },
}
