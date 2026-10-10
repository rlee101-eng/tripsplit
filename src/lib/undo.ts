/** The most recent change that can be reversed, shown briefly as an "Undo" bar. */
export interface UndoAction {
  label: string
  run: () => Promise<void>
}

let current: UndoAction | null = null
const listeners = new Set<() => void>()

function set(action: UndoAction | null) {
  current = action
  listeners.forEach((l) => l())
}

export const undoStore = {
  subscribe(cb: () => void) {
    listeners.add(cb)
    return () => void listeners.delete(cb)
  },
  get: () => current,
}

export function offerUndo(label: string, run: () => Promise<void>) {
  set({ label, run })
}

export function dismissUndo() {
  set(null)
}

export async function runUndo() {
  const action = current
  set(null)
  await action?.run()
}
