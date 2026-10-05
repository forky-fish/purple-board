// Agents: the subagents (and teammates) of this session, running and finished.
const COLOR = { running: 'yellow', pending: 'yellow', waiting: 'red', idle: 'green', completed: 'green', failed: 'red', killed: 'red' }
const MAX_ROWS = 40

export default {
  id: 'agents',
  title: 'Agents',
  help: {
    about: 'Subagents of this session, running ones first.',
    keys: [],
  },
  short: 'Agent',

  async load(ctx) {
    const d = ctx.live('agents')
    try { d.list = (await ctx.agents()).slice(-MAX_ROWS) } catch { d.list = [] }
  },

  render(ctx, el) {
    const list = ctx.live('agents').list
    if (!list) return [el.Text({ key: 'wait', dimColor: true, children: ['loading…'] })]
    if (!list.length) return [el.Text({ key: 'none', dimColor: true, children: ['No subagent in this session.'] })]
    const rank = (a) => (a.status === 'running' || a.status === 'waiting' || a.status === 'pending' ? 0 : 1)
    return [...list].sort((a, b) => rank(a) - rank(b)).map((a) => {
      const finished = ['completed', 'failed', 'killed'].includes(a.status)
      return el.Box({
        key: 'a-' + a.id, flexDirection: 'row', columnGap: 2,
        children: [
          el.Text({ key: 'dot', color: COLOR[a.status], dimColor: finished && a.status === 'completed', children: ['●'] }),
          el.Text({ key: 'name', dimColor: finished, children: [(a.name || a.description || a.id.slice(0, 8)).slice(0, 50)] }),
          el.Text({ key: 'type', color: 'cyan', dimColor: true, children: [a.type || ''] }),
          el.Text({ key: 'status', dimColor: true, children: [a.status] }),
        ],
      })
    })
  },
}
