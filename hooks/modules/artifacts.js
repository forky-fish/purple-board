// Artifacts: the pages this session published with the Artifact tool, as a list of links.
// Recorded from tool events only; nothing is sent to the model. The browser view can also
// show each one from its local source file.
import { ago, basename, heading } from '../lib/util.js'

const URL_RE = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/
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

  render(ctx, el) {
    const items = ctx.data('artifacts', () => ({ items: [] })).items
    if (!items.length) return [el.Text({ key: 'none', dimColor: true, children: ['No artifact published in this session.'] })]
    const now = Date.now()
    return [
      heading(el, 'title', 'Published in this session'),
      ...items.map((i) => el.Box({
        key: 'a-' + i.url, flexDirection: 'row', columnGap: 2,
        children: [
          el.Text({ key: 'link', children: [el.Link({ href: i.url, label: i.title })] }),
          el.Text({ key: 'ago', dimColor: true, children: [ago(now - i.at)] }),
        ],
      })),
    ]
  },
}
