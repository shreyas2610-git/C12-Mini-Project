import { useState, useEffect } from 'react'
import { X, AlertCircle, Clock, Zap, MapPin } from 'lucide-react'
import {
  Category,
  CommonArea,
  UserProfile,
  createComplaint,
  fetchCategories,
  fetchCommonAreas,
} from '../../api/endpoints/complaints'

interface NewComplaintModalProps {
  userProfile: UserProfile | null
  onClose: () => void
  onSuccess: (complaintId: number) => void
}

export function NewComplaintModal({ userProfile, onClose, onSuccess }: NewComplaintModalProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [commonAreas, setCommonAreas] = useState<CommonArea[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)

  // Form state
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationType, setLocationType] = useState<'FLAT' | 'COMMON_AREA'>('FLAT')
  const [commonAreaId, setCommonAreaId] = useState<number | ''>('')
  const [urgent, setUrgent] = useState(false)
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [caption, setCaption] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchCategories(), fetchCommonAreas()])
      .then(([cats, areas]) => {
        setCategories(cats)
        setCommonAreas(areas)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingLookups(false))
  }, [])

  const selectedCategory = categories.find((c) => c.category_id === Number(categoryId))

  // Calculate live preview score: severity points + urgent boost
  const previewScore = selectedCategory
    ? selectedCategory.severity_points + (urgent ? 15 : 0)
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!categoryId) {
      setError('Please choose a complaint category.')
      return
    }
    if (!description.trim()) {
      setError('Please provide a description.')
      return
    }
    if (locationType === 'COMMON_AREA' && !commonAreaId) {
      setError('Please select a common area.')
      return
    }

    setSubmitting(true)
    try {
      const res = await createComplaint({
        category_id: Number(categoryId),
        title: title.trim() || undefined,
        description: description.trim(),
        location_type: locationType,
        common_area_id: locationType === 'COMMON_AREA' ? Number(commonAreaId) : null,
        urgent_flag: urgent,
        attachment_url: attachmentUrl.trim() || null,
        caption: caption.trim() || null,
      })
      onSuccess(res.complaint_id)
    } catch (err: any) {
      setError(err.message || 'Failed to submit complaint')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-200 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Raise a Complaint</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Submit your issue to township management with automated SLA tracking
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Location Choice */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Location
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocationType('FLAT')}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                  locationType === 'FLAT'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin className={`h-4 w-4 ${locationType === 'FLAT' ? 'text-indigo-600' : 'text-gray-400'}`} />
                <div>
                  <div className="text-sm font-semibold">My Flat</div>
                  <div className="text-xs text-gray-500">
                    {userProfile?.tower_name
                      ? `Flat ${userProfile.flat_number}, Tower ${userProfile.tower_name}`
                      : 'Assigned Flat'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLocationType('COMMON_AREA')}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                  locationType === 'COMMON_AREA'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin className={`h-4 w-4 ${locationType === 'COMMON_AREA' ? 'text-indigo-600' : 'text-gray-400'}`} />
                <div>
                  <div className="text-sm font-semibold">Common Area</div>
                  <div className="text-xs text-gray-500">Pool, Gym, Park, Parking</div>
                </div>
              </button>
            </div>

            {locationType === 'COMMON_AREA' && (
              <div className="mt-3">
                <select
                  value={commonAreaId}
                  onChange={(e) => setCommonAreaId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select a common area…</option>
                  {commonAreas.map((ca) => (
                    <option key={ca.common_area_id} value={ca.common_area_id}>
                      {ca.name} ({ca.zone_name})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Category Dropdown */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Complaint Category <span className="text-red-500">*</span>
              </label>
              {selectedCategory && (
                <span className="text-xs text-indigo-600 font-medium">
                  Trade: {selectedCategory.trade_name || 'Direct to GM (Sensitive)'}
                </span>
              )}
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={loadingLookups}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  [{c.severity}] {c.name} — SLA: {c.resolution_sla_h}h (Lvl {c.level})
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Brief Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedCategory ? selectedCategory.name : 'e.g. Water leaking in master bathroom'}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Detailed Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail, exact spot, when it began, etc."
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Urgent & Photo Options */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
              <input
                id="urgent-check"
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="urgent-check" className="text-xs text-amber-900 leading-snug cursor-pointer">
                <span className="font-bold flex items-center gap-1 text-amber-800">
                  <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> Mark as Urgent (+15 Pts)
                </span>
                Immediate safety hazard or emergency requiring priority triage.
              </label>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Photo URL / Image Link (Optional)"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Photo Caption (e.g. Under-sink seepage)"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          {selectedCategory && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-xs ring-1 ring-gray-200">
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4 text-indigo-600" />
                <span>Response SLA: <strong>{selectedCategory.response_sla_h}h</strong></span>
                <span className="text-gray-300">•</span>
                <span>Resolution SLA: <strong>{selectedCategory.resolution_sla_h}h</strong></span>
              </div>
              <div className="text-right">
                <span className="text-gray-500">Initial Priority Score:</span>{' '}
                <span className="font-bold text-indigo-700 text-sm">{previewScore} pts</span>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Complaint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

