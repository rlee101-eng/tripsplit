export function WaitingForPartner() {
  const url = location.origin + location.pathname
  return (
    <div className="balance-card zero">
      <div className="balance-who">Waiting for your partner</div>
      <p>
        Send them this link. Once they've added it to their home screen and signed in with their email, you can start
        adding expenses.
      </p>
      <code className="share-url">{url}</code>
      {'share' in navigator && (
        <button className="btn primary" onClick={() => navigator.share({ title: 'TripSplit', url }).catch(() => {})}>
          Share link
        </button>
      )}
    </div>
  )
}
