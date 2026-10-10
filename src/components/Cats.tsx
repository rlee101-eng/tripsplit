import { useEffect, useId, useState } from 'react'

export type CatKind = 'tabby' | 'calico'

/** The crayon-brown used for every outline, the eyes and the mouth. */
const LINE = '#7a4a33'
const CREAM = '#f8efdd'
const PINK = '#f3cfc8'

/** Coat colours: a brown tabby, and a calico with one orange ear and one dark ear. */
const COATS = {
  tabby: { fur: '#a98a6d', leftEar: '#a98a6d', rightEar: '#a98a6d' },
  calico: { fur: '#fbf4e6', leftEar: '#eaa55c', rightEar: '#6e4d3d' },
} as const

const HEAD = 'M60 14 C93 14 113 37 113 61 C113 83 95 93 60 93 C25 93 7 83 7 61 C7 37 27 14 60 14 Z'
const HEART = 'M8 14 C2 9.5 0 6.6 0 4.2 C0 1.8 1.8 0 4 0 C5.6 0 7.1 0.9 8 2.3 C8.9 0.9 10.4 0 12 0 C14.2 0 16 1.8 16 4.2 C16 6.6 14 9.5 8 14 Z'

/**
 * A soft, hand-drawn cat face peeking over an edge, paws first. Pat it and it squints and
 * sends up hearts. `happy` keeps the squint on (used when everything is settled).
 */
export function Cat({ kind, happy = false, size = 66 }: { kind: CatKind; happy?: boolean; size?: number }) {
  const id = useId()
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
  const outline = { stroke: LINE, strokeWidth: 3.6, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

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
      <svg viewBox="-10 0 140 106" aria-hidden>
        <defs>
          <clipPath id={`${id}-head`}>
            <path d={HEAD} />
          </clipPath>
          {/* A slight wobble, so the lines look drawn by hand. */}
          <filter id={`${id}-wobble`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed={kind === 'tabby' ? 3 : 8} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
          </filter>
        </defs>

        <g filter={`url(#${id}-wobble)`}>
          {/* Whiskers */}
          <path d="M8 60 l-13 -4 M7 68 l-14 1 M10 76 l-12 6 M112 60 l13 -4 M113 68 l14 1 M110 76 l12 6" fill="none" {...outline} strokeWidth={2.6} />

          {/* Ears, tucked behind the head */}
          <path d="M15 46 C9 27 13 9 23 9 C31 9 44 17 51 24 Z" fill={coat.leftEar} {...outline} />
          <path d="M105 46 C111 27 107 9 97 9 C89 9 76 17 69 24 Z" fill={coat.rightEar} {...outline} />
          <path d="M21 35 C18 25 20 17 25 17 C30 17 36 21 40 25 Z" fill={PINK} />
          <path d="M99 35 C102 25 100 17 95 17 C90 17 84 21 80 25 Z" fill={PINK} />

          <path d={HEAD} fill={coat.fur} />
          <g clipPath={`url(#${id}-head)`}>
            {kind === 'tabby' ? (
              <path d="M46 19 v13 M60 16 v18 M74 19 v13" stroke="#7d6048" strokeWidth="7" strokeLinecap="round" fill="none" />
            ) : (
              <>
                <path d="M0 0 H64 C62 30 46 54 4 56 Z" fill="#eaa55c" />
                <path d="M120 0 H72 C74 26 88 46 118 46 Z" fill="#6e4d3d" />
                <path d="M34 22 v11 M46 19 v13" stroke="#d98a3e" strokeWidth="6" strokeLinecap="round" fill="none" />
              </>
            )}
            {/* Cream lower face, rising to the mouth */}
            <path d="M0 73 C22 73 36 68 45 61 C51 56 55 53 60 53 C65 53 69 56 75 61 C84 68 98 73 120 73 V106 H0 Z" fill={CREAM} />
          </g>
          <path d={HEAD} fill="none" {...outline} />

          {/* Rosy cheeks */}
          <ellipse cx="27" cy="70" rx="8.5" ry="7" fill="#ee938c" opacity={squint ? 0.95 : 0.75} />
          <ellipse cx="93" cy="70" rx="8.5" ry="7" fill="#ee938c" opacity={squint ? 0.95 : 0.75} />

          {squint ? (
            <path d="M34 59 q6 -7.5 12 0 M74 59 q6 -7.5 12 0" fill="none" {...outline} strokeWidth={3.2} />
          ) : (
            <g className="cat-eyes" fill={LINE}>
              <circle cx="40" cy="57" r="5.4" />
              <circle cx="80" cy="57" r="5.4" />
            </g>
          )}
          <path d="M49 61 q5.5 7 11 0 q5.5 7 11 0" fill="none" {...outline} strokeWidth={3} />

          {/* Paws, resting on whatever the cat is peeking over */}
          <ellipse cx="38" cy="95" rx="11" ry="8" fill={CREAM} {...outline} strokeWidth={3.2} />
          <ellipse cx="82" cy="95" rx="11" ry="8" fill={CREAM} {...outline} strokeWidth={3.2} />
        </g>
      </svg>
    </button>
  )
}

/** Both cats side by side, to sit on the top edge of a card. */
export function Cats({ happy }: { happy?: boolean }) {
  return (
    <div className="cats">
      <Cat kind="tabby" happy={happy} size={70} />
      <Cat kind="calico" happy={happy} size={64} />
    </div>
  )
}
