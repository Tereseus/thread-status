import { expect, test } from 'claude-code/testing'

const NOW = 1_800_000_000_000
const DIR = 'C:/AppData/Claude/claude-code-sessions/acct/org'
const files: Record<string, object> = {
  'local_a.json': { sessionId: 'a', title: 'Build the game', lastTurnEdgeAt: NOW - 600_000, latestUserFrameAt: NOW - 600_000, lastActivityAt: NOW - 5_000, isStarred: true },
  'local_b.json': { sessionId: 'b', title: 'Fix the login', lastTurnEdgeAt: NOW - 120_000, latestUserFrameAt: NOW - 900_000, lastActivityAt: NOW - 10_000 },
  'local_c.json': { sessionId: 'c', title: 'Waiting thread', interruptedAwaitingPerson: { kind: 'permission' }, lastActivityAt: NOW - 60_000, lastTurnEdgeAt: NOW - 60_000 },
  'local_d.json': { sessionId: 'd', title: 'Daily report', scheduledTaskId: 'daily-report', lastTurnEdgeAt: NOW - 3_600_000, latestUserFrameAt: NOW - 3_700_000, lastActivityAt: NOW - 3_600_000 },
  'local_f.json': { sessionId: 'f', cliSessionId: 'cf', title: 'Pick the sprites', lastTurnEdgeAt: NOW - 300_000, latestUserFrameAt: NOW - 900_000, lastActivityAt: NOW - 300_000 },
  'local_e.json': { sessionId: 'e', title: 'Old archived', isArchived: true, lastActivityAt: NOW - 1000 },
}

const wire = (on: any) => {
  on('env.get', (_: any, e: any) => ({ value: [e.name, e.key, e].includes('APPDATA') ? 'C:/AppData' : [e.name, e.key, e].includes('HOME') ? 'C:/home' : undefined }))
  on('clock.now', () => ({ value: NOW }))
  on('fs.list', (_: any, e: any) => {
    const p = String(e.path).split(String.fromCharCode(92)).join('/')
    if (p.endsWith('claude-code-sessions')) return { value: [{ name: 'acct', kind: 'dir', size: 0, mtimeMs: 0 }] }
    if (p.endsWith('/acct')) return { value: [{ name: 'org', kind: 'dir', size: 0, mtimeMs: 0 }] }
    if (p === DIR) return { value: Object.keys(files).map(n => ({ name: n, kind: 'file', size: 10, mtimeMs: NOW - 1000 })) }
    throw new Error('ENOENT ' + p)
  })
  on('fs.read', (_: any, e: any) => ({ value: JSON.stringify(files[String(e.path).split(String.fromCharCode(92)).join('/').split('/').pop() as string]) }))
  on('store.keys', () => ({ value: ['ask:cf', 'ask:old'] }))
  on('store.get', (_: any, e: any) => ({ value: e.key === 'ask:cf' ? { at: NOW - 299_000, ask: 'Tell me which ones pass.' } : { at: NOW - 9 * 24 * 3600_000, ask: 'stale?' } }))
  on('store.delete', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'threads' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
}

const PANE = {
  plugin: 'thread-status', component: 'Pane', requestId: 'thread-status',
  props: { title: 'Threads', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('sorts threads into needs you, working, done and jobs', async ($, on) => {
  wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /NEEDS YOU \(2\)/ }))?.text).toContain('NEEDS YOU')
  expect((await ui.find({ type: 'Text', text: /which ones pass/ }))?.text).toContain('Tell me')
  expect((await ui.find({ type: 'Text', text: /Waiting thread/ }))?.text).toContain('Waiting thread')
  expect((await ui.find({ type: 'Text', text: /WORKING \(2\)/ }))?.text).toContain('WORKING (2)')
  expect((await ui.find({ type: 'Text', text: /Build the game/ }))?.text).toContain('10 min')
  expect((await ui.find({ type: 'Text', text: /Daily report/ }))?.text).toContain('ran 1 h ago')
  expect(await ui.find({ type: 'Text', text: /Old archived/ })).toBeUndefined()
  await ui.unmount()
})

test('a turn that ends with a question records it for every panel', async ($, on) => {
  const written: Record<string, any> = {}
  on('session.id', () => ({ value: 'abc' }))
  on('clock.now', () => ({ value: NOW }))
  on('store.set', (_: any, e: any) => { written[String(e.key)] = e.value; return { value: undefined } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  await $.turn.complete({ answer: 'Done. Want me to push it now?', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const rec = written['ask:abc']
  if (!rec) throw new Error('written: ' + JSON.stringify(Object.keys(written)))
  expect(rec.ask).toContain('push it now')
})
