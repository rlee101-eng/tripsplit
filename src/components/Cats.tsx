import { useEffect, useId, useState } from 'react'

export type CatKind = 'tabby' | 'calico'

const INK = '#2a2320'
const CREAM = '#fffaf2'
const PINK = '#f0b3ab'

/** Coat colours: a brown tabby with a white bib, and a calico. */
const COATS = {
  tabby: { fur: '#7a6450', dark: '#43362c', eye: '#b7c56b', leftEar: '#7a6450', rightEar: '#7a6450' },
  calico: { fur: CREAM, dark: '#3b2e27', eye: '#dba548', leftEar: '#e08f43', rightEar: '#3b2e27' },
} as const

const HEART = 'M8 14 C2 9.5 0 6.6 0 4.2 C0 1.8 1.8 0 4 0 C5.6 0 7.1 0.9 8 2.3 C8.9 0.9 10.4 0 12 0 C14.2 0 16 1.8 16 4.2 C16 6.6 14 9.5 8 14 Z'

/**
 * A cartoon cat peeking over an edge, paws first. Pat it and it squints and sends up hearts.
 * `happy` keeps the squint on (used when everything is settled).
 */
export function Cat({ kind, happy = false, size = 58 }: { kind: CatKind; happy?: boolean; size?: number }) {
  const clip = useId()
  const coat = COATS[kind]
  /** Counts pats, so each one restarts the hearts. */
  const [pats, setPats] = useState(0)
  const [patted, setPatted] = useState(false)

  useEffect(() => {
    if (!pats) return
    const t = setTimeout(() => setPatted(false), 1400)
    return () => clearTimeout(t)
  }, [pats])

  const squint = happy || patted
  const outline = kind === 'calico' ? '#e3d7c7' : 'none'

  return (
    <button
      className={`kitty ${kind} ${patted ? 'patted' : ''}`}
      style={{ width: size }}
      onClick={() => {
        setPats(pats + 1)
        setPatted(true)
      }}
      aria-label="Pat the cat"
    >
      {pats > 0 && (
        <span className="cat-hearts" key={pats} aria-hidden>
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 16 14">
              <path d={HEART} />
            </svg>
          ))}
        </span>
      )}
      <svg viewBox="0 0 100 96" aria-hidden>
        <defs>
          <clipPath id={clip}>
            <ellipse cx="50" cy="54" rx="38" ry="31" />
          </clipPath>
        </defs>

        {/* Ears */}
        <path d="M16 40 L19 7 L45 26 Z" fill={coat.leftEar} stroke={coat.leftEar} strokeWidth="3" strokeLinejoin="round" />
        <path d="M84 40 L81 7 L55 26 Z" fill={coat.rightEar} stroke={coat.rightEar} strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 31 L25 16 L37 25 Z" fill={PINK} />
        <path d="M76 31 L75 16 L63 25 Z" fill={PINK} />

        {/* Fluffy cheeks */}
        <path d="M14 50 L4 60 L13 63 L7 73 L24 72 Z" fill={coat.fur} stroke={outline} strokeLinejoin="round" />
        <path d="M86 50 L96 60 L87 63 L93 73 L76 72 Z" fill={coat.fur} stroke={outline} strokeLinejoin="round" />

        <ellipse cx="50" cy="54" rx="38" ry="31" fill={coat.fur} stroke={outline} />

        <g clipPath={`url(#${clip})`}>
          {kind === 'tabby' ? (
            <>
              {/* White muzzle and bib, forehead and cheek stripes */}
              <ellipse cx="50" cy="78" rx="23" ry="21" fill={CREAM} />
              <path d="M50 23 v11 M40 25 l2.5 9 M60 25 l-2.5 9" stroke={coat.dark} strokeWidth="3.6" strokeLinecap="round" fill="none" />
              <path d="M13 49 l11 3 M13 59 l10 0 M87 49 l-11 3 M87 59 l-10 0" stroke={coat.dark} strokeWidth="3" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              {/* Orange and black patches over a white face */}
              <path d="M0 0 H54 L47 38 Q34 60 6 60 Z" fill="#e08f43" />
              <path d="M100 0 H60 L62 30 Q74 50 96 46 Z" fill={coat.dark} />
              <path d="M30 22 q8 6 4 16" stroke="#c9722c" strokeWidth="3" strokeLinecap="round" fill="none" />
            </>
          )}
        </g>

        {squint ? (
          <path d="M27 54 q7 -8 14 0 M59 54 q7 -8 14 0" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : (
          <g className="cat-eyes">
            <ellipse cx="34" cy="52" rx="6.6" ry="7.6" fill={coat.eye} />
            <ellipse cx="66" cy="52" rx="6.6" ry="7.6" fill={coat.eye} />
            <ellipse cx="34" cy="52" rx="3.2" ry="6.2" fill={INK} />
            <ellipse cx="66" cy="52" rx="3.2" ry="6.2" fill={INK} />
            <circle cx="36" cy="49" r="1.8" fill="#fff" />
            <circle cx="68" cy="49" r="1.8" fill="#fff" />
          </g>
        )}

        {/* Blush, nose, mouth, whiskers */}
        <ellipse cx="24" cy="65" rx="5" ry="3" fill="#f2a59c" opacity={squint ? 0.75 : 0.35} />
        <ellipse cx="76" cy="65" rx="5" ry="3" fill="#f2a59c" opacity={squint ? 0.75 : 0.35} />
        <path d="M46.4 62 h7.2 l-3.6 4.2 Z" fill="#e58f88" stroke="#e58f88" strokeWidth="1" strokeLinejoin="round" />
        <path d="M50 66.5 v2.5 M50 69 q-4 4.5 -8 1 M50 69 q4 4.5 8 1" stroke="#5a4038" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        <path d="M20 67 l-15 -3 M20 71 l-15 2 M80 67 l15 -3 M80 71 l15 2" stroke="#9a8b7b" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

        {/* Paws, resting on whatever the cat is peeking over */}
        <g fill={CREAM} stroke="#e3d7c7">
          <ellipse cx="31" cy="88" rx="11" ry="7.5" />
          <ellipse cx="69" cy="88" rx="11" ry="7.5" />
        </g>
        <path d="M27.5 89 v4 M34.5 89 v4 M65.5 89 v4 M72.5 89 v4" stroke="#d8c9b6" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/** Both cats side by side, to sit on the top edge of a card. */
export function Cats({ happy }: { happy?: boolean }) {
  return (
    <div className="cats">
      <Cat kind="tabby" happy={happy} size={62} />
      <Cat kind="calico" happy={happy} size={56} />
    </div>
  )
}
