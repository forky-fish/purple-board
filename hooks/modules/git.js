// Git: status and recent commits of the session's repository.
import { clip } from '../lib/util.js'

export default {
  id: 'git',
  title: 'Git',
  render(ctx, el) {
    const g = ctx.view.git
    if (g.branch === undefined || g.branch === null) return [el.Text({ key: 'none', dimColor: true, children: ['Not a git repository.'] })]
    return [el.Code({ key: 'git', source: clip((g.status || 'working tree clean') + '\n\n' + (g.log || '')) })]
  },
}
