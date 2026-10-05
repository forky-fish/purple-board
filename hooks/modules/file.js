// File tab: renders a Markdown file. Built in as "card" (.claude/dock.md); config can add more.
import { clip } from '../lib/util.js'

export function fileModule({ id, title, file }) {
  const path = (ctx) => (file.startsWith('/') ? file : ctx.root + '/' + file)
  return {
    id,
    title,
    async load(ctx) {
      const d = ctx.live(id)
      try { d.text = await ctx.readFile(path(ctx)) } catch { d.text = '' }
    },
    render(ctx, el) {
      const text = ctx.live(id).text
      if (!text) return [el.Text({ key: 'none', dimColor: true, children: ['No file at ' + file + '.'] })]
      return [el.Text({ key: 'path', dimColor: true, children: [file] }), el.Markdown({ key: 'md', text: clip(text) })]
    },
  }
}
