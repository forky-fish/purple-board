// Artifacts: the pages this session published with the Artifact tool, as a list of links.
// Recorded from tool events only; nothing is sent to the model. The browser view can also
// show each one from its local source file.
import { ago, basename, heading } from '../lib/util.js'

const URL_RE = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/
const URL_RE_ALL = new RegExp(URL_RE.source, 'g')
const ATTACHED_RE = /<artifact-attached url="([^"]+)" title="([^"]*)"/g
const MAX_ITEMS = 50

function extractUrl(result, e) {
  let text = ''
  try { text = typeof result === 'string' ? result : JSON.stringify(result) } catch { /* unserializable */ }
  const m = String(text || '').match(URL_RE) || String(e.url || '').match(URL_RE)
  return m ? m[0] : null
}

export default {
  id: 'artifacts',
  title: 'Artifacts',
  help: {
    about: 'Artifacts published in this session, plus ones attached with /artifacts or linked in the conversation.',
    keys: ['Enter on a link opens it in the browser'],
  },
  short: 'Art',

  async event(ctx, ev) {
    if (ev.type !== 'tool' || ev.e.tool !== 'Artifact') return
    const e = ev.e
    if (e.action && e.action !== 'publish') return
    if (e.asset) return // an asset upload, not a page
    const url = extractUrl(ev.result, e)
    if (!url) return
    const d = ctx.data('artifacts', () => ({ items: [] }))
    const file = typeof e.file_path === 'string' ? e.file_path : ''
    const known = d.items.find((i) => i.url === url)
    let title = known?.title || basename(file) || 'artifact'
    if (file.endsWith('.html')) {
      try {
        const m = (await ctx.readFile(file)).match(/<title[^>]*>([^<]{1,200})<\/title>/i)
        if (m) title = m[1].trim()
      } catch { /* file gone or unreadable: keep the basename */ }
    }
    const item = { url, title, file_path: file || known?.file_path || '', at: Date.now() }
    d.items = [item, ...d.items.filter((i) => i.url !== url)].slice(0, MAX_ITEMS)
  },

  // Artifacts attached with /artifacts or linked in the conversation: read from the session's
  // messages, locally, only while this tab is shown.
  async load(ctx) {
    const d = ctx.live('artifacts')
    const found = new Map()
    let messages = []
    try { messages = await ctx.messages() } catch { /* no messages */ }
    if (!Array.isArray(messages)) messages = []
    for (const m of messages) {
      const texts = [m.text || '', ...(m.toolResults || []).map((r) => r.text || '')]
      for (const text of texts) {
        for (const [, url, title] of text.matchAll(ATTACHED_RE)) {
          if (URL_RE.test(url)) found.set(url, { url, title: title || 'artifact', how: 'attached' })
        }
        for (const [url] of text.matchAll(URL_RE_ALL)) {
          if (!found.has(url)) found.set(url, { url, title: url.split('/').pop(), how: m.role === 'user' ? 'linked by you' : 'mentioned' })
        }
      }
    }
    d.seen = [...found.values()].reverse()
  },

  render(ctx, el) {
    const items = ctx.data('artifacts', () => ({ items: [] })).items
    const published = new Set(items.map((i) => i.url))
    const seen = (ctx.live('artifacts').seen || []).filter((i) => !published.has(i.url))
    if (!items.length && !seen.length) return [el.Text({ key: 'none', dimColor: true, children: ['No artifact in this session yet.'] })]
    const now = Date.now()
    const out = []
    if (items.length) {
      out.push(heading(el, 'title', 'Published in this session'))
      for (const i of items) out.push(el.Box({
        key: 'a-' + i.url, flexDirection: 'row', columnGap: 2,
        children: [
          el.Text({ key: 'link', children: [el.Link({ href: i.url, label: i.title })] }),
          el.Text({ key: 'ago', dimColor: true, children: [ago(now - i.at)] }),
        ],
      }))
    }
    if (seen.length) {
      if (items.length) out.push(el.Text({ key: 'gap', children: [' '] }))
      out.push(heading(el, 'title2', 'Attached or linked'))
      for (const i of seen) out.push(el.Box({
        key: 's-' + i.url, flexDirection: 'row', columnGap: 2,
        children: [
          el.Text({ key: 'link', children: [el.Link({ href: i.url, label: i.title })] }),
          el.Text({ key: 'how', dimColor: true, children: [i.how] }),
        ],
      }))
    }
    return out
  },
}
