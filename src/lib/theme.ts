import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

/** Per-device preference; the inline script in index.html applies it before first paint. */
const KEY = 'theme'
const dark = matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref = read()

function apply() {
  const isDark = pref === 'dark' || (pref === 'system' && dark.matches)
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', isDark ? '#111615' : '#f5f0e8')
}

// Follow the phone's setting live while on "System".
dark.addEventListener('change', apply)

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Private mode: the choice still applies until the app is closed.
  }
  apply()
  listeners.forEach((l) => l())
}

export function useThemePref() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}
