import { useState } from 'react'
import { formatAud } from '../lib/money'
import { useSession } from '../lib/session'

/** Big "who owes whom" card with a two-step "Mark as settled" button. */
export function BalanceCard({
  net,
  label,
  onSettle,
  partialHref,
}: {
  net: number
  label?: string
  onSettle: () => Promise<void>
  /** Where to record a part payment. Omit where there's no single trip to record it against. */
  partialHref?: string
}) {
  const { partner } = useSession()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const other = partner?.display_name ?? 'Partner'

  const settle = async () => {
    setBusy(true)
    try {
      await onSettle()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className={`balance-card ${net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero'}`}>
      {label && <div className="balance-label">{label}</div>}
      {net === 0 ? (
        <>
          <div className="balance-amount">All square</div>
          <div className="balance-who">Nothing owed between you two</div>
        </>
      ) : (
        <>
          <div className="balance-who">{net > 0 ? `${other} owes you` : `You owe ${other}`}</div>
          <div className="balance-amount">{formatAud(Math.abs(net))}</div>
        </>
      )}
      {net !== 0 &&
        (confirming ? (
          <div className="confirm">
            <p>
              Confirm {net > 0 ? `${other} has paid you` : `you've paid ${other}`} {formatAud(Math.abs(net))}?
            </p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={settle} disabled={busy}>
                Yes, settled
              </button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <button className="btn primary" onClick={() => setConfirming(true)}>
              Mark as settled
            </button>
            {partialHref && (
              <a className="btn ghost" href={partialHref}>
                Partial payment
              </a>
            )}
          </div>
        ))}
    </div>
  )
}
