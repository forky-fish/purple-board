// Command tab: shows the output of a command (argv, no shell). Only from the global config,
// never from a project's config, so a cloned repository cannot make the dock run anything.
import { clip } from '../lib/util.js'

export function commandModule({ id, title, command }) {
  return {
    id,
    title,
    help: { about: 'Output of `' + command.join(' ') + '`, run in the project root while this tab is shown.', keys: [] },
    async load(ctx) {
      const d = ctx.live(id)
      try {
        const r = await ctx.run(command)
        d.text = (r.stdout.trim() || r.stderr.trim() || '(no output)')
      } catch (error) {
        d.text = 'command failed: ' + String(error)
      }
    },
    render(ctx, el) {
      return [el.Text({ key: 'cmd', dimColor: true, children: ['$ ' + command.join(' ')] }), el.Code({ key: 'out', source: clip(ctx.live(id).text || '…') })]
    },
  }
}
