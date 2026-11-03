import { useTowers } from '../hooks/useTowers'
import { useFlats } from '../hooks/useFlats'

interface ResidentFieldsProps {
  towerId: number | null
  flatId: number | null
  onTowerChange: (id: number | null) => void
  onFlatChange: (id: number | null) => void
}

export function ResidentFields({ towerId, flatId, onTowerChange, onFlatChange }: ResidentFieldsProps) {
  const { towers, loading: towersLoading, error: towersError } = useTowers()
  const { flats, loading: flatsLoading, error: flatsError } = useFlats(towerId)

  return (
    <div className="space-y-4">
      {towersError && (
        <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 ring-1 ring-red-200">
          Failed to load towers: {towersError}
        </div>
      )}
      {flatsError && (
        <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 ring-1 ring-red-200">
          Failed to load flats: {flatsError}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Tower <span className="text-red-500">*</span>
        </label>
        <select
          value={towerId ?? ''}
          onChange={(e) => {
            const val = e.target.value
            onTowerChange(val === '' ? null : Number(val))
            onFlatChange(null)
          }}
          disabled={towersLoading}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">
            {towersLoading
              ? 'Loading towers…'
              : towers.length === 0
                ? 'No towers available'
                : 'Select a tower'}
          </option>
          {towers.map((t) => (
            <option key={t.tower_id} value={t.tower_id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Flat <span className="text-red-500">*</span>
        </label>
        <select
          value={flatId ?? ''}
          onChange={(e) => {
            const val = e.target.value
            onFlatChange(val === '' ? null : Number(val))
          }}
          disabled={towerId === null || flatsLoading}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">
            {flatsLoading
              ? 'Loading flats…'
              : towerId === null
                ? 'Select a tower first'
                : 'Select a flat'}
          </option>
          {flats.map((f) => (
            <option key={f.flat_id} value={f.flat_id}>
              {f.flat_number}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
