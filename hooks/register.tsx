import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Job, Snapshot, Thread } from '../types'

// Thread Status: one panel beside the chat that answers "which of my Claude threads need me, which are working,
// what just finished, and did my scheduled jobs run?"
//
// It reads only the Claude desktop app's own session files (claude-code-sessions/<account>/<org>/local_*.json), so it
// needs nothing else installed. Those files are written by the app; their fields are not a published format, so every
// read here is defensive and a field that is missing just means "unknown".

const PANE = 'thread-status'
const POLL_MS = 15_000
const WINDOW_MS = 3 * 24 * 3600_000 // only sessions touched in the last 3 days
const STALE_MS = 2 * 3600_000 // a "working" thread silent for 2 hours has died, not worked
// A thread "needs you" when its last turn ended asking you something. A mod cannot read transcripts (they grow to
// gigabytes), so each thread's own copy of this mod records its last answer's ending when the turn completes, in the
// mod's own store under ask:<session id>. The engine reads the store from disk on every call, so every copy sees them all.
export const ASK_RE = /\?|\b(tell me|let me know|want me to|should i|do you want|which (one|ones)|your call|ok them|approve|pick one|choose|confirm|say the word|say go|waiting (on|for) you)\b/i
export const askOf = (answer: string): string => {
  const tail = String(answer || '').slice(-250) // only the closing lines: a "?" quoted further up is not a question to you
  return ASK_RE.test(tail) ? tail.replace(/\s+/g, ' ').trim().slice(-160) : ''
}
const snapshot = atom({ plugin: 'thread-status', key: 'snapshot' } as const, null)

type Meta = {
  sessionId?: string
  title?: string
  isArchived?: boolean
  isStarred?: boolean
  scheduledTaskId?: string
  lastActivityAt?: number
  lastTurnEdgeAt?: number
  latestUserFrameAt?: number
  interruptedAwaitingPerson?: unknown
  cliSessionId?: string
}

const ago = (m: number) => (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago')
const span = (m: number) => (m < 1 ? 'under a minute' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min')

// The app marks a turn's start and end on lastTurnEdgeAt. A turn the person started sets it to their message's time;
// one a background task or a peer started shows as activity running on past the edge.
export const stateOf = (m: Meta, now: number): Thread['state'] => {
  if (m.interruptedAwaitingPerson) return 'needs'
  const act = Number(m.lastActivityAt) || 0
  const edge = Number(m.lastTurnEdgeAt) || 0
  const user = Number(m.latestUserFrameAt) || 0
  if (now - act > STALE_MS) return 'idle'
  if (edge > 0 && (user === edge || act - edge > 5000)) return 'working'
  return 'idle'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // $.env.get takes literal names only, so each variable is read on its own line.
    const safe = async (p: Promise<string | undefined>) => {
      try { return (await p) || '' } catch { return '' }
    }
    const appData = await safe($.env.get('APPDATA'))
    const xdg = await safe($.env.get('XDG_CONFIG_HOME'))
    const home = (await safe($.env.get('HOME'))) || (await safe($.env.get('USERPROFILE')))
    const roots = [
      appData && appData + '/Claude/claude-code-sessions',
      home && home + '/Library/Application Support/Claude/claude-code-sessions',
      (xdg || (home && home + '/.config')) && (xdg || home + '/.config') + '/Claude/claude-code-sessions',
    ].filter(Boolean) as string[]

    const list = async (p: string) => {
      try { return await $.fs.list(p) } catch { return [] }
    }
    // The signed-in account is the folder with the newest session file: the app keeps folders of accounts used before.
    const sessionFolder = async (): Promise<string> => {
      let best = '', newest = -1
      for (const root of roots) {
        for (const a of await list(root)) {
          if (a.kind !== 'dir') continue
          for (const b of await list(root + '/' + a.name)) {
            if (b.kind !== 'dir') continue
            const dir = root + '/' + a.name + '/' + b.name
            const at = Math.max(-1, ...(await list(dir)).filter(f => f.name.startsWith('local_')).map(f => f.mtimeMs))
            if (at > newest) { newest = at; best = dir }
          }
        }
      }
      return best
    }

    const cache = new Map<string, { mtime: number; meta: Meta }>()
    const scan = async (): Promise<Snapshot> => {
      const now = await $.clock.now()
      const dir = await sessionFolder()
      if (dir === '') return { threads: [], jobs: [], foundSessions: false }
      const metas: Meta[] = []
      for (const f of await list(dir)) {
        if (!/^local_.*\.json$/.test(f.name) || now - f.mtimeMs > WINDOW_MS) continue
        let hit = cache.get(f.name)
        if (!hit || hit.mtime !== f.mtimeMs) {
          try {
            hit = { mtime: f.mtimeMs, meta: JSON.parse(await $.fs.read(dir + '/' + f.name)) as Meta }
            cache.set(f.name, hit)
          } catch { continue } // a file the app is writing right now; read it on the next pass
        }
        if (!hit.meta.isArchived && hit.meta.title) metas.push(hit.meta)
      }

      const asks = new Map<string, { at: number; ask: string }>()
      for (const k of await $.store.keys().catch(() => [] as string[])) {
        if (!k.startsWith('ask:')) continue
        const a = (await $.store.get(k).catch(() => undefined)) as { at?: number; ask?: string } | undefined
        const at = Number(a?.at) || 0
        if (now - at > WINDOW_MS) { await $.store.delete(k).catch(() => {}); continue } // keep the store small
        asks.set(k.slice(4), { at, ask: String(a?.ask || '') })
      }
      const threads: Thread[] = []
      const byTask = new Map<string, Meta[]>()
      for (const m of metas) {
        if (m.scheduledTaskId) {
          byTask.set(m.scheduledTaskId, [...(byTask.get(m.scheduledTaskId) || []), m])
          continue
        }
        let state = stateOf(m, now)
        const a = asks.get(String(m.cliSessionId || ''))
        // the record must belong to the turn that ended last, not an older one
        const ask = state === 'idle' && a && a.ask && a.at >= (Number(m.lastTurnEdgeAt) || 0) - 120_000 ? a.ask : ''
        if (ask) state = 'needs'
        const since = state === 'working' ? Number(m.lastTurnEdgeAt) : Number(m.lastActivityAt)
        threads.push({
          ask, id: String(m.sessionId || m.title), title: String(m.title), state,
          sinceMin: Math.max(0, Math.round((now - (since || now)) / 60000)), isPinned: !!m.isStarred,
        })
      }
      const dayStart = now - 24 * 3600_000
      const jobs: Job[] = [...byTask.entries()].map(([task, runs]) => {
        const sorted = runs.sort((a, b) => (Number(b.lastActivityAt) || 0) - (Number(a.lastActivityAt) || 0))
        const last = sorted[0] as Meta
        return {
          task, title: String(last.title || task), isRunning: stateOf(last, now) === 'working',
          lastMin: Math.round((now - (Number(last.lastActivityAt) || now)) / 60000),
          runsToday: runs.filter(r => (Number(r.lastActivityAt) || 0) > dayStart).length,
        }
      }).sort((a, b) => a.title.localeCompare(b.title))
      return { threads, jobs, foundSessions: true }
    }

    const tick = async () => {
      const s = await scan().catch(() => null)
      if (s !== null) await update($, snapshot, () => s)
    }
    await tick()
    $.clock.every(POLL_MS, () => void tick())
    await $.command.register({ name: 'threads', description: 'Thread Status: which threads need you, which are working, and how your scheduled jobs ran' })
    void $.ui.open({ id: PANE, title: 'Thread Status' }).catch(() => {})
    return next(e)
  })

  // Each thread records how its own turn ended, for every copy of this mod to read.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const id = await $.session.id().catch(() => '')
      if (id) await $.store.set('ask:' + id, { at: await $.clock.now(), ask: '' }).catch(() => {})
    }
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && !e.isAborted) {
      const id = await $.session.id().catch(() => '')
      if (id) await $.store.set('ask:' + id, { at: await $.clock.now(), ask: askOf(e.answer) }).catch(() => {})
    }
    return r
  })

  on('command.run', { command: 'threads' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Thread Status' })
    return { text: 'Thread Status opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    if (s === null) return <Text dimColor>Reading your threads…</Text>
    if (!s.foundSessions) return <Text dimColor>No Claude desktop sessions found on this computer.</Text>

    const pin = (t: Thread) => (t.isPinned ? '📌 ' : '')
    const needs = s.threads.filter(t => t.state === 'needs')
    const working = s.threads.filter(t => t.state === 'working').sort((a, b) => b.sinceMin - a.sinceMin)
    const recent = s.threads.filter(t => t.state === 'idle' && t.sinceMin < 24 * 60).sort((a, b) => a.sinceMin - b.sinceMin).slice(0, 10)
    const quiet = s.threads.filter(t => t.state === 'idle' && t.sinceMin >= 24 * 60).length

    const heading = (text: string) => <Box marginTop={1}><Text bold>{text}</Text></Box>
    return (
      <Box flexDirection="column">
        {needs.length > 0 && heading('🙋 NEEDS YOU (' + needs.length + ')')}
        {needs.map(t => (
          <Box key={'n-' + t.id} flexDirection="column" paddingLeft={2} marginBottom={1}>
            <Text bold>{pin(t) + t.title}</Text>
            {t.ask !== '' && <Text>{'…' + t.ask}</Text>}
            <Text dimColor>{(t.ask !== '' ? '💬 asked you · ' : '⏸ waiting for approval · ') + ago(t.sinceMin)}</Text>
          </Box>
        ))}
        {needs.length === 0 && <Text dimColor>Nothing is waiting on you.</Text>}

        {heading('⚙ WORKING (' + working.length + ')')}
        {working.length === 0 && <Text dimColor>  No thread is working right now.</Text>}
        {working.map(t => <Text key={'w-' + t.id}>{'  ' + pin(t) + t.title + ' · ' + span(t.sinceMin)}</Text>)}

        {heading('✅ RECENTLY DONE')}
        {recent.length === 0 && <Text dimColor>  Nothing in the last day.</Text>}
        {recent.map(t => <Text key={'r-' + t.id} dimColor>{'  ' + pin(t) + t.title + ' · ' + ago(t.sinceMin)}</Text>)}
        {quiet > 0 && <Text dimColor>{'  …and ' + quiet + ' quiet for over a day'}</Text>}

        {heading('🕒 SCHEDULED JOBS (' + s.jobs.length + ')')}
        {s.jobs.length === 0 && <Text dimColor>  No scheduled job ran in the last 3 days.</Text>}
        {s.jobs.map(j => (
          <Text key={'j-' + j.task} dimColor={!j.isRunning}>
            {'  ' + (j.isRunning ? '⏳ ' : '✓ ') + j.title + ' · ' + (j.isRunning ? 'running now' : 'ran ' + ago(j.lastMin)) + (j.runsToday > 1 ? ' · ' + j.runsToday + ' runs today' : '')}
          </Text>
        ))}
      </Box>
    )
  })
}
