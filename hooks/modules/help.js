// Help: how the dock works and what every tab shows, built from each module's `help`.
import { heading, spacer } from '../lib/util.js'

const GENERAL = [
  '/sdock            open the dock (/sdock <tab> opens a tab, e.g. /sdock notes)',
  '/sdock reset      start a new "Since you were away" window',
  '/sdock close      close the dock (or Esc while it has the keyboard)',
  '1–9  switch tabs · h  help · r  reload · Tab  walk buttons and inputs',
  'Keys work while the dock has the keyboard: /sdock gives it, click it, or use your focus key.',
  'Placement: beside the transcript in fullscreen from 110 columns, else above the prompt.',
  'The dock never writes into the conversation and costs no tokens.',
  'Config: ~/.claude/session-dock/config.json (global), <project>/.claude/dock.json (tabs per project).',
]

export default {
  id: 'help',
  title: 'Help',
  short: '?',
  help: {
    about: 'This page.',
    keys: [],
  },

  render(ctx, el) {
    const out = [heading(el, 'h-general', 'Session dock')]
    GENERAL.forEach((line, i) => out.push(el.Text({ key: 'g' + i, children: [line] })))
    for (const m of ctx.tabs) {
      if (m.id === 'help') continue
      out.push(spacer(el, 'sp-' + m.id))
      out.push(heading(el, 'h-' + m.id, m.title))
      out.push(el.Text({ key: 'about-' + m.id, children: [m.help?.about || 'No description.'] }))
      for (const [i, k] of (m.help?.keys || []).entries()) out.push(el.Text({ key: 'k-' + m.id + i, dimColor: true, children: ['  ' + k] }))
    }
    return out
  },
}
