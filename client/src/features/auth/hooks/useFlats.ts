import { useEffect, useState } from 'react'
import { fetchFlats, Flat } from '../../../api/endpoints/lookup'

export function useFlats(towerId: number | null) {
  const [flats, setFlats] = useState<Flat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (towerId === null) {
      setFlats([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    fetchFlats(towerId)
      .then(setFlats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load flats'))
      .finally(() => setLoading(false))
  }, [towerId])

  return { flats, loading, error }
}
