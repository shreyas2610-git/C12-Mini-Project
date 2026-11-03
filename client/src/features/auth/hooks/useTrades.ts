import { useEffect, useState } from 'react'
import { fetchTrades, Trade } from '../../../api/endpoints/lookup'

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchTrades()
      .then(setTrades)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load trades'))
      .finally(() => setLoading(false))
  }, [])

  return { trades, loading, error }
}
