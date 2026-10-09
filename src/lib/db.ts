import Dexie, { type Table } from 'dexie'
import type { Expense, Member, Settlement, Trip } from './types'

export interface CachedRate {
  /** `${date}:${currency}` */
  key: string
  date: string
  currency: string
  /** AUD per 1 unit of currency. */
  rate: number
  fetched_at: string
}

export interface Meta {
  key: string
  value: unknown
}

class TripDB extends Dexie {
  members!: Table<Member, string>
  trips!: Table<Trip, string>
  expenses!: Table<Expense, string>
  settlements!: Table<Settlement, string>
  rates!: Table<CachedRate, string>
  meta!: Table<Meta, string>

  constructor() {
    super('tripsplit')
    this.version(1).stores({
      members: 'user_id, dirty',
      trips: 'id, dirty',
      expenses: 'id, trip_id, dirty, date',
      settlements: 'id, trip_id, dirty, date',
      rates: 'key, currency, date',
      meta: 'key',
    })
  }
}

export const db = new TripDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

export const SYNCED_TABLES = ['members', 'trips', 'expenses', 'settlements'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]
