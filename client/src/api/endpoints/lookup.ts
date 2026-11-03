const BASE = 'http://localhost:8000/api/v1'

export interface Tower { tower_id: number; name: string }
export interface Flat { flat_id: number; flat_number: string }
export interface Trade { trade_id: number; name: string }

export async function fetchTowers(): Promise<Tower[]> {
  const res = await fetch(`${BASE}/towers`)
  if (!res.ok) throw new Error('Failed to fetch towers')
  return res.json()
}

export async function fetchFlats(towerId: number): Promise<Flat[]> {
  const res = await fetch(`${BASE}/towers/${towerId}/flats`)
  if (!res.ok) throw new Error('Failed to fetch flats')
  return res.json()
}

export async function fetchTrades(): Promise<Trade[]> {
  const res = await fetch(`${BASE}/trades`)
  if (!res.ok) throw new Error('Failed to fetch trades')
  return res.json()
}
