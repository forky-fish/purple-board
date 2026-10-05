// Notes: a small task list per project and a global one. One note per line, as Markdown task
// items ("- [ ] text"), in ~/.claude/session-dock/notes/. Notes belong to the project and the
// user, not to a session: they survive Reset and new sessions. Other lines in the files are
// kept untouched.
import { heading, spacer } from '../lib/util.js'

const MAX_NOTES = 30 // shown per list
const ITEM = /^- \[( |x|X)\] (.*)$/

export function slug(root) {
  return String(root).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'root'
}

export function notePath(ctx, scope) {
  return ctx.dir + '/notes/' + (scope === 'global' ? 'global.md' : 'projects/' + slug(ctx.root) + '.md')
}

// lines -> [{ raw, done?, text? }]; only task lines carry text
export function parse(source) {
  return String(source).split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).map((raw) => {
    const m = raw.match(ITEM)
    return m ? { raw, done: m[1] !== ' ', text: m[2] } : { raw }
  })
}

export function format(lines) {
  return lines.map((l) => l.raw).join('\n') + '\n'
}

export default {
  id: 'notes',
  title: 'Notes',
  help: {
    about: 'A note list per project and a global one, kept across sessions and resets. Stored in ~/.claude/session-dock/notes/.',
    keys: ['/sdock notes  opens the pane focused on the input', 'type, Enter  add a note', 'Tab  walk the buttons and the input', '[project]/[global]  switch where new notes go', '☐/☑  toggle done · ✕  delete'],
  },

  async load(ctx) {
    const d = ctx.live('notes')
    for (const scope of ['project', 'global']) {
      try { d[scope] = parse(await ctx.readFile(notePath(ctx, scope))) } catch { d[scope] = [] }
    }
  },

  render(ctx, el) {
    const d = ctx.live('notes')
    d.scope = d.scope || 'project'
    d.draft = d.draft || 0
    const reload = async () => { await this.load(ctx); ctx.invalidate() }
    const mutate = async (scope, change) => {
      let lines = []
      try { lines = parse(await ctx.readFile(notePath(ctx, scope))) } catch { /* new file */ }
      change(lines)
      await ctx.writeFile(notePath(ctx, scope), format(lines))
      await reload()
    }
    const out = []
    out.push(el.Box({
      key: 'add', flexDirection: 'row', columnGap: 2,
      children: [
        el.Button({ key: 'scope', label: d.scope === 'project' ? '[project]' : '[global]', plain: true, onPress: () => { d.scope = d.scope === 'project' ? 'global' : 'project'; ctx.invalidate() } }),
        el.Input({
          key: 'input-' + d.draft, autoFocus: true, placeholder: 'new note, Enter to add to ' + d.scope, submitLabel: 'add',
          onSubmit: (value) => {
            const text = String(value).replace(/\s+/g, ' ').trim()
            if (!text) return
            d.draft++
            return mutate(d.scope, (lines) => lines.push({ raw: '- [ ] ' + text }))
          },
        }),
      ],
    }))
    for (const [scope, title] of [['project', 'This project'], ['global', 'Global']]) {
      out.push(spacer(el, 'gap-' + scope))
      out.push(heading(el, 'h-' + scope, title))
      const lines = d[scope]
      const tasks = (lines || []).map((l, index) => ({ ...l, index })).filter((l) => l.text !== undefined)
      if (!tasks.length) out.push(el.Text({ key: 'none-' + scope, dimColor: true, children: ['no notes'] }))
      for (const t of tasks.slice(0, MAX_NOTES)) {
        out.push(el.Box({
          key: 'n-' + scope + '-' + t.index, flexDirection: 'row', columnGap: 1,
          children: [
            el.Button({
              key: 'done', label: t.done ? '☑' : '☐', plain: true,
              onPress: () => mutate(scope, (ls) => {
                const l = ls[t.index]
                if (l && l.text === t.text) ls[t.index] = { raw: '- [' + (t.done ? ' ' : 'x') + '] ' + t.text, done: !t.done, text: t.text }
              }),
            }),
            el.Button({
              key: 'del', label: '✕', plain: true, dimColor: true,
              onPress: () => mutate(scope, (ls) => { if (ls[t.index] && ls[t.index].text === t.text) ls.splice(t.index, 1) }),
            }),
            el.Text({ key: 'text', dimColor: t.done, children: [t.text] }),
          ],
        }))
      }
      if (tasks.length > MAX_NOTES) out.push(el.Text({ key: 'more-' + scope, dimColor: true, children: ['… ' + (tasks.length - MAX_NOTES) + ' more'] }))
    }
    return out
  },
}
