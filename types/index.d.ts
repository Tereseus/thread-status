export type Thread = {
  id: string
  title: string
  state: 'needs' | 'working' | 'idle'
  sinceMin: number // working: minutes since the turn began; otherwise minutes since the last activity
  isPinned: boolean
  ask: string // the end of its last reply when that reply asks you something, else ''
}
export type Job = { task: string; title: string; isRunning: boolean; lastMin: number; runsToday: number }
export type Snapshot = { threads: Thread[]; jobs: Job[]; foundSessions: boolean }

declare module 'claude-code' {
  interface PluginState {
    'thread-status': { snapshot: Snapshot | null }
  }
}
