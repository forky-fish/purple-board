// Plan: the session's task list, as the model keeps it with TodoWrite or the Task* tools.
// Recorded from tool events only; the dock never writes a plan or sends anything to the model.
import { meter } from '../lib/util.js'

const MAX_ITEMS = 60
const STATUS = new Set(['pending', 'in_progress', 'completed'])

const fresh = () => ({ items: [], updatedAt: 0, creates: 0 })

function asObject(result) {
  if (result && typeof result === 'object') return result
  try { return JSON.parse(String(result)) } catch { return {} }
}

function cleanTodos(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && typeof t.content === 'string')
    .slice(0, MAX_ITEMS)
    .map((t) => ({ content: t.content.slice(0, 200), activeForm: String(t.activeForm || t.content).slice(0, 200), status: STATUS.has(t.status) ? t.status : 'pending' }))
}

export default {
  id: 'plan',
  title: 'Plan',

  event(ctx, ev) {
    if (ev.type !== 'tool') return
    const e = ev.e
    if (!['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList'].includes(e.tool)) return
    const d = ctx.data('plan', fresh)
    const r = asObject(ev.result)
    if (e.tool === 'TodoWrite') {
      const todos = cleanTodos(e.todos?.length ? e.todos : r.newTodos)
      d.items = todos.map((t, i) => ({ id: String(i + 1), ...t }))
    } else if (e.tool === 'TaskCreate') {
      d.creates = (d.creates || 0) + 1
      const id = String(r.task?.id ?? d.creates)
      const subject = String(e.subject || r.task?.subject || 'task').slice(0, 200)
      d.items = [...d.items.filter((i) => i.id !== id), { id, content: subject, activeForm: String(e.activeForm || subject).slice(0, 200), status: 'pending' }].slice(0, MAX_ITEMS)
    } else if (e.tool === 'TaskUpdate') {
      if (r.success === false) return
      const id = String(e.taskId)
      if (e.status === 'deleted') d.items = d.items.filter((i) => i.id !== id)
      else {
        const item = d.items.find((i) => i.id === id)
        if (!item) return
        if (STATUS.has(e.status)) item.status = e.status
        if (e.subject) item.content = String(e.subject).slice(0, 200)
        if (e.activeForm) item.activeForm = String(e.activeForm).slice(0, 200)
      }
    } else if (e.tool === 'TaskList' && Array.isArray(r.tasks)) {
      d.items = r.tasks.slice(0, MAX_ITEMS).map((t) => {
        const old = d.items.find((i) => i.id === String(t.id))
        return { id: String(t.id), content: String(t.subject || '').slice(0, 200), activeForm: old?.activeForm || String(t.subject || '').slice(0, 200), status: STATUS.has(t.status) ? t.status : 'pending' }
      })
    }
    d.updatedAt = Date.now()
  },

  render(ctx, el) {
    const items = ctx.data('plan', fresh).items
    if (!items.length) return [el.Text({ key: 'none', dimColor: true, children: ['No task list in this session yet.'] })]
    const done = items.filter((i) => i.status === 'completed').length
    return [
      meter(el, 'progress', 'done ' + done + '/' + items.length, (done / items.length) * 100),
      el.Text({ key: 'gap', children: [' '] }),
      ...items.map((i) => el.Text({
        key: 'i-' + i.id,
        color: i.status === 'in_progress' ? 'yellow' : undefined,
        dimColor: i.status === 'completed',
        children: [(i.status === 'completed' ? '☑ ' : i.status === 'in_progress' ? '▶ ' : '☐ ') + (i.status === 'in_progress' ? i.activeForm : i.content)],
      })),
    ]
  },
}

// One line for the Overview: "plan 3/7, now: Running tests"; '' without a plan.
export function planSummary(ctx) {
  const items = ctx.state?.modules?.plan?.items
  if (!Array.isArray(items) || !items.length) return ''
  const done = items.filter((i) => i.status === 'completed').length
  const now = items.find((i) => i.status === 'in_progress')
  return 'plan ' + done + '/' + items.length + (now ? ', now: ' + now.activeForm : done === items.length ? ', all done' : '')
}
