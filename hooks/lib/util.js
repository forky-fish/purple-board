// Small helpers shared by the core and the modules. No I/O: the plugin API ($) may only be
// used in hooks/register.js, so modules reach files and commands through ctx (see there).
export const MAX_CHARS = 9500 // Markdown and Code elements take at most 10,000 characters
export const WARN = 65
export const ALARM = 85
const SPARK = '▁▂▃▄▅▆▇█'

export function clip(text) {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n\n… (cut off)' : text
}

export function level(percent) {
  return percent >= ALARM ? 'red' : percent >= WARN ? 'yellow' : 'green'
}

export function sparkline(values) {
  if (values.length < 2) return ''
  return values.map((v) => SPARK[Math.min(7, Math.max(0, Math.floor((v / 100) * 8)))]).join('')
}

export function limitLabel(kind) {
  return { five_hour: '5h', seven_day: '7d' }[kind] || String(kind).slice(0, 7)
}

export function ago(ms) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 6) / 10
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' d ago'
}

export function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

// A meter row: label, coloured bar, percent.
export function meter(el, key, label, percent, width = 20) {
  const p = Math.max(0, Math.min(100, Math.round(percent ?? 0)))
  const filled = Math.round((p / 100) * width)
  return el.Box({
    key, flexDirection: 'row', columnGap: 1,
    children: [
      el.Text({ dimColor: true, children: [label.padEnd(8)] }),
      el.Text({ color: level(p), children: ['█'.repeat(filled)] }),
      el.Text({ dimColor: true, children: ['░'.repeat(width - filled)] }),
      el.Text({ children: [String(p).padStart(3) + '%'] }),
    ],
  })
}

export function heading(el, key, text) {
  return el.Text({ key, bold: true, color: 'magenta', children: [text] })
}

export function spacer(el, key) {
  return el.Text({ key, children: [' '] })
}
