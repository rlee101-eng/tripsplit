import { useSyncExternalStore } from 'react'

export type Route =
  | { page: 'home' }
  | { page: 'trip'; id: string }
  | { page: 'expense'; id?: string; tripId?: string }
  | { page: 'settle'; tripId: string }
  | { page: 'settings' }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(query)
  const [a, b] = path.split('/')
  switch (a) {
    case 'trip':
      return b ? { page: 'trip', id: b } : { page: 'home' }
    case 'expense':
      return { page: 'expense', id: b || undefined, tripId: params.get('trip') ?? undefined }
    case 'settle':
      return params.get('trip') ? { page: 'settle', tripId: params.get('trip')! } : { page: 'home' }
    case 'settings':
      return { page: 'settings' }
    default:
      return { page: 'home' }
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return parseHash(hash)
}

export function go(hash: string) {
  location.hash = hash
}

export function back(fallback = '#/') {
  if (history.length > 1) history.back()
  else go(fallback)
}
