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

// Flat list of the task lines of both scopes, in display order.
function entries(d) {
  const out = []
  for (const scope of ['project', 'global']) {
    (d[scope] || []).forEach((l, index) => { if (l.text !== undefined) out.push({ scope, index, text: l.text, done: l.done }) })
  }
  return out
}

export default {
  id: 'notes',
  title: 'Notes',
  help: {
    about: 'A note list per project and a global one, kept across sessions and resets. Stored in ~/.claude/session-dock/notes/.',
    keys: [
      'a  add a note (Enter saves, Enter on an empty field cancels)',
      'j / k  move the cursor down / up',
      't  toggle done · d  delete (press twice) · m  move to the other list',
      'p  add to: project / global',
      'Mouse: ☐/☑ toggles, [✕] deletes',
    ],
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
    d.cursor = d.cursor || 0
    const list = entries(d)
    if (d.cursor >= list.length) d.cursor = Math.max(0, list.length - 1)
    const at = list[d.cursor]
    const reload = async () => { await this.load(ctx); ctx.invalidate() }
    const mutate = async (scope, change) => {
      let lines = []
      try { lines = parse(await ctx.readFile(notePath(ctx, scope))) } catch { /* new file */ }
      change(lines)
      await ctx.writeFile(notePath(ctx, scope), format(lines))
      await reload()
    }
    // Only change a line that still holds what was shown (the file may have changed meanwhile).
    const same = (ls, t) => ls[t.index] && ls[t.index].text === t.text
    const toggle = (t) => mutate(t.scope, (ls) => { if (same(ls, t)) ls[t.index] = { raw: '- [' + (t.done ? ' ' : 'x') + '] ' + t.text, done: !t.done, text: t.text } })
    const remove = (t) => mutate(t.scope, (ls) => { if (same(ls, t)) ls.splice(t.index, 1) })
    const move = async (t) => {
      const other = t.scope === 'project' ? 'global' : 'project'
      await mutate(other, (ls) => ls.push({ raw: '- [' + (t.done ? 'x' : ' ') + '] ' + t.text }))
      await remove(t)
    }
    const key = (k, label, onPress, dim = true) => el.Button({ key: 'k-' + k, label, hotkey: k, plain: true, dimColor: dim, onPress })

    const out = []
    out.push(el.Box({
      key: 'keys', flexDirection: 'row', columnGap: 2, flexWrap: 'wrap',
      children: [
        key('a', '+ add (a)', () => { d.adding = true; d.confirm = false; ctx.invalidate() }, false),
        key('p', 'to: ' + d.scope + ' (p)', () => { d.scope = d.scope === 'project' ? 'global' : 'project'; ctx.invalidate() }),
        key('j', 'j↓', () => { d.cursor = Math.min(list.length - 1, d.cursor + 1); d.confirm = false; ctx.invalidate() }),
        key('k', 'k↑', () => { d.cursor = Math.max(0, d.cursor - 1); d.confirm = false; ctx.invalidate() }),
        key('t', 't done', () => (at ? toggle(at) : undefined)),
        key('d', d.confirm ? 'd again to delete' : 'd del', () => { if (!at) return; if (d.confirm) { d.confirm = false; return remove(at) } else { d.confirm = true; ctx.invalidate() } }, !d.confirm),
        key('m', 'm move', () => (at ? move(at) : undefined)),
      ],
    }))
    if (d.adding) {
      out.push(el.Input({
        key: 'input-' + d.draft, autoFocus: true, label: d.scope + ': ', placeholder: 'new note — Enter saves, empty Enter cancels', submitLabel: 'add',
        onSubmit: (value) => {
          const text = String(value).replace(/\s+/g, ' ').trim()
          d.adding = false
          d.draft++
          if (!text) { ctx.invalidate(); return }
          return mutate(d.scope, (lines) => lines.push({ raw: '- [ ] ' + text }))
        },
      }))
    }
    let n = 0
    for (const [scope, title] of [['project', 'This project'], ['global', 'Global']]) {
      out.push(spacer(el, 'gap-' + scope))
      out.push(heading(el, 'h-' + scope, title))
      const tasks = list.filter((t) => t.scope === scope)
      if (!tasks.length) out.push(el.Text({ key: 'none-' + scope, dimColor: true, children: ['no notes'] }))
      for (const t of tasks.slice(0, MAX_NOTES)) {
        const pos = n++
        const here = pos === d.cursor
        out.push(el.Box({
          key: 'n-' + scope + '-' + t.index, flexDirection: 'row', columnGap: 1,
          children: [
            el.Text({ key: 'cur', color: 'magenta', children: [here ? '▸' : ' '] }),
            el.Button({ key: 'done', label: t.done ? '☑' : '☐', plain: true, onPress: () => toggle(t) }),
            el.Button({ key: 'del', label: '[✕]', plain: true, hover: { color: 'red' }, onPress: () => remove(t) }),
            el.Text({ key: 'text', inverse: here, dimColor: t.done && !here, strikethrough: t.done, children: [t.text] }),
          ],
        }))
      }
      if (tasks.length > MAX_NOTES) { n += tasks.length - MAX_NOTES; out.push(el.Text({ key: 'more-' + scope, dimColor: true, children: ['… ' + (tasks.length - MAX_NOTES) + ' more'] })) }
    }
    return out
  },
}
