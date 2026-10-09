import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Null when no Supabase project is configured. The app then runs in
 * "local mode": data stays on this device and you can switch between the
 * two people in Settings (handy for trying the app out).
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null

export const LOCAL_MODE = supabase === null
