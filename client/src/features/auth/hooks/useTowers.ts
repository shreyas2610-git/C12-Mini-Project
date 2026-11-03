import { useEffect, useState } from 'react'
import { fetchTowers, Tower } from '../../../api/endpoints/lookup'

export function useTowers() {
  const [towers, setTowers] = useState<Tower[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchTowers()
      .then(setTowers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load towers'))
      .finally(() => setLoading(false))
  }, [])

  return { towers, loading, error }
}
