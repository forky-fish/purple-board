// Ports: TCP ports your own processes listen on (from `ss`; on Windows `netstat` + `tasklist`),
// with the ones started inside this project marked (Linux only: Windows has no cheap way to ask
// a process for its working directory). Loads only while the tab is shown.
import { isWindowsPath } from '../lib/util.js'

const MAX_ROWS = 40

// "LISTEN 0 4096 127.0.0.1:7777 0.0.0.0:* users:(("node",pid=1234,fd=20))" -> rows
export function parseSs(text) {
  const seen = new Set()
  const rows = []
  for (const line of String(text).split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 5) continue
    const port = Number(f[3].slice(f[3].lastIndexOf(':') + 1))
    const m = line.match(/\("([^"]*)",pid=(\d+)/) // only processes of this user carry details
    if (!port || !m) continue
    const key = port + ':' + m[2]
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ port, name: m[1], pid: Number(m[2]), local: /^(127\.|\[::1\]|localhost)/.test(f[3]) })
  }
  return rows
}

// "  TCP    127.0.0.1:7777    0.0.0.0:0    LISTENING    1234" -> rows (names filled in later)
export function parseNetstat(text) {
  const seen = new Set()
  const rows = []
  for (const line of String(text).split(/\r?\n/)) {
    const f = line.trim().split(/\s+/)
    // The state word is localized (German: ABHÖREN); a listener is the row whose remote end is port 0.
    if (f.length < 5 || f[0] !== 'TCP' || !/:0$/.test(f[2])) continue
    const port = Number(f[1].slice(f[1].lastIndexOf(':') + 1))
    const pid = Number(f[4])
    if (!port || !pid || seen.has(port + ':' + pid)) continue
    seen.add(port + ':' + pid)
    rows.push({ port, name: '?', pid, local: /^(127\.|\[::1\])/.test(f[1]) })
  }
  return rows
}

// '"node.exe","1234","Console","1","50,000 K"' -> Map pid -> "node"
export function parseTasklist(text) {
  const names = new Map()
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^"([^"]*)","(\d+)"/)
    if (m) names.set(Number(m[2]), m[1].replace(/\.exe$/i, ''))
  }
  return names
}

async function loadWindows(ctx, d) {
  let r
  try { r = await ctx.run(['netstat', '-ano', '-p', 'TCP'], 10000) } catch { r = null }
  if (!r || r.exitCode > 0) { d.error = 'netstat is not available.'; d.rows = []; return }
  const rows = parseNetstat(r.stdout).slice(0, MAX_ROWS)
  try {
    const t = await ctx.run(['tasklist', '/FO', 'CSV', '/NH'], 10000)
    const names = parseTasklist(t.stdout)
    for (const row of rows) row.name = names.get(row.pid) || '?'
  } catch { /* ports without names */ }
  d.rows = rows.sort((a, b) => a.port - b.port)
}

export default {
  id: 'ports',
  title: 'Ports',
  help: {
    about: 'TCP ports your own processes listen on; ● marks servers started inside this project.',
    keys: [],
  },

  async load(ctx) {
    const d = ctx.live('ports')
    d.error = ''
    if (isWindowsPath(ctx.root)) return loadWindows(ctx, d)
    let r
    try { r = await ctx.run(['ss', '-ltnpH'], 5000) } catch { r = null }
    if (!r || r.exitCode > 0 || (!r.stdout && r.stderr)) { d.error = 'ss is not available (package iproute2).'; d.rows = []; return }
    const rows = parseSs(r.stdout).slice(0, MAX_ROWS)
    for (const row of rows.slice(0, 25)) {
      try {
        const cwd = (await ctx.run(['readlink', '/proc/' + row.pid + '/cwd'], 2000)).stdout.trim()
        row.mine = !!cwd && (cwd === ctx.root || cwd.startsWith(ctx.root + '/'))
      } catch { /* process gone */ }
    }
    d.rows = rows.sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || a.port - b.port)
  },

  render(ctx, el) {
    const d = ctx.live('ports')
    if (d.error) return [el.Text({ key: 'err', dimColor: true, children: [d.error] })]
    if (!d.rows) return [el.Text({ key: 'wait', dimColor: true, children: ['loading…'] })]
    if (!d.rows.length) return [el.Text({ key: 'none', dimColor: true, children: ['No listening port of yours.'] })]
    return d.rows.map((r) => el.Box({
      key: 'p-' + r.port + '-' + r.pid, flexDirection: 'row', columnGap: 2,
      children: [
        el.Text({ key: 'mark', color: 'green', children: [r.mine ? '●' : ' '] }),
        el.Text({ key: 'port', bold: !!r.mine, children: [String(r.port).padStart(5)] }),
        el.Text({ key: 'name', children: [r.name] }),
        el.Text({ key: 'pid', dimColor: true, children: ['pid ' + r.pid] }),
        el.Text({ key: 'scope', dimColor: true, children: [r.local ? 'local' : 'open'] }),
      ],
    }))
  },
}
