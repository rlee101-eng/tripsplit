import { useEffect, useSyncExternalStore } from 'react'
import { Undo2 } from 'lucide-react'
import { dismissUndo, runUndo, undoStore } from '../lib/undo'

/** How long the bar stays up before the chance to undo passes. */
const VISIBLE_MS = 8000

export function UndoBar() {
  const action = useSyncExternalStore(undoStore.subscribe, undoStore.get)

  useEffect(() => {
    if (!action) return
    const t = setTimeout(dismissUndo, VISIBLE_MS)
    return () => clearTimeout(t)
  }, [action])

  if (!action) return null
  return (
    <div className="undo-bar" role="status">
      <span>{action.label}</span>
      <button onClick={() => void runUndo()}>
        <Undo2 size={16} strokeWidth={2} aria-hidden /> Undo
      </button>
    </div>
  )
}
