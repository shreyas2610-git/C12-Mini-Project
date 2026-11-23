import { useState } from 'react'
import {
  X,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Send,
  Ban,
  Copy,
  FolderSync,
} from 'lucide-react'
import {
  Category,
  Complaint,
  changeCategory,
  closeDuplicate,
  closeInvalid,
  confirmAndRoute,
  requestClarification,
} from '../../../api/endpoints/complaints'
import { apiHandOff } from '../../../api/endpoints/zm'

interface TriageActionModalProps {
  complaint: Complaint
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}

type TriageTab = 'CONFIRM_ROUTE' | 'HAND_OFF' | 'CLARIFY' | 'CATEGORY' | 'INVALID' | 'DUPLICATE'

export function TriageActionModal({
  complaint,
  categories,
  onClose,
  onSuccess,
}: TriageActionModalProps) {
  const [tab, setTab] = useState<TriageTab>('CONFIRM_ROUTE')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [routeZoneId, setRouteZoneId] = useState<number>(complaint.zone_id)
  const [routeNote, setRouteNote] = useState('')
  const [clarifyQuestion, setClarifyQuestion] = useState('')
  const [invalidReason, setInvalidReason] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [duplicateReason, setDuplicateReason] = useState('')
  const [newCategoryId, setNewCategoryId] = useState<number>(complaint.category_id)

  async function handleConfirmRoute() {
    setSubmitting(true)
    setError(null)
    try {
      await confirmAndRoute(complaint.complaint_id, routeZoneId, routeNote || undefined)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleHandOff() {
    setSubmitting(true)
    setError(null)
    try {
      await apiHandOff(complaint.complaint_id, complaint.version)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestClarification() {
    if (!clarifyQuestion.trim()) {
      setError('Please provide a specific clarification question.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await requestClarification(complaint.complaint_id, clarifyQuestion.trim())
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseInvalid() {
    if (!invalidReason.trim()) {
      setError('Please provide the justification for marking as Invalid.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await closeInvalid(complaint.complaint_id, invalidReason.trim())
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseDuplicate() {
    const parentId = parseInt(duplicateId, 10)
    if (isNaN(parentId) || parentId <= 0) {
      setError('Please enter a valid parent Complaint ID.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await closeDuplicate(complaint.complaint_id, parentId, duplicateReason.trim() || undefined)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleChangeCategory() {
    if (newCategoryId === complaint.category_id) {
      setError('Please choose a different category.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await changeCategory(complaint.complaint_id, newCategoryId)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-200 sm:p-8">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-gray-500">
                Ticket #{complaint.complaint_id}
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {complaint.category_name}
              </span>
              <span className="text-xs font-bold text-indigo-600">
                Score: {complaint.priority_score} pts
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-gray-900">
              Coordinator Triage & Routing
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Complaint Snapshot */}
        <div className="mt-4 rounded-xl bg-gray-50 p-3.5 text-xs text-gray-700">
          <div className="font-semibold text-gray-900">{complaint.title || complaint.category_name}</div>
          <p className="mt-1 text-gray-600 line-clamp-2">{complaint.description}</p>
          <div className="mt-2 flex gap-4 text-gray-500 text-[11px]">
            <span>
              Location:{' '}
              <strong>
                {complaint.common_area_name
                  ? complaint.common_area_name
                  : `Flat ${complaint.flat_number}, ${complaint.tower_name}`}
              </strong>
            </span>
            <span>Zone: <strong>{complaint.zone_name}</strong></span>
          </div>
        </div>

        {/* Action Tabs */}
        <div className="mt-5 flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
          <button
            type="button"
            onClick={() => setTab('CONFIRM_ROUTE')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'CONFIRM_ROUTE'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirm & Route
          </button>
          <button
            type="button"
            onClick={() => setTab('HAND_OFF')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'HAND_OFF'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Hand Off to ZM/GM
          </button>
          <button
            type="button"
            onClick={() => setTab('CLARIFY')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'CLARIFY' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            Ask Clarification
          </button>
          <button
            type="button"
            onClick={() => setTab('CATEGORY')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'CATEGORY' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FolderSync className="h-3.5 w-3.5" />
            Change Category
          </button>
          <button
            type="button"
            onClick={() => setTab('INVALID')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'INVALID' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Ban className="h-3.5 w-3.5" />
            Mark Invalid
          </button>
          <button
            type="button"
            onClick={() => setTab('DUPLICATE')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'DUPLICATE' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
            Mark Duplicate
          </button>
        </div>

        {/* Tab Forms */}
        <div className="mt-4">
          {/* TAB 1: Confirm & Route */}
          {tab === 'CONFIRM_ROUTE' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-900">
                Stamps this complaint as genuine and routes it to the designated Zone Manager
                (or GM if category is sensitive). Moves phase to <strong>Assigned</strong>.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Target Zone</label>
                <select
                  value={routeZoneId}
                  onChange={(e) => setRouteZoneId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  <option value={1}>Zone 1 (Jasmine, Lotus, Clubhouse)</option>
                  <option value={2}>Zone 2 (Rose, Lily, Marigold, Park)</option>
                  <option value={3}>Zone 3 (Tulip, Orchid, Parking, Sports Court)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Triage Note (Optional)</label>
                <input
                  type="text"
                  value={routeNote}
                  onChange={(e) => setRouteNote(e.target.value)}
                  placeholder="e.g. Verified by phone; urgent plumbing required"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmRoute}
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Confirming…' : 'Confirm Genuine & Route to Zone Manager'}
              </button>
            </div>
          )}

          {/* TAB 1B: Hand Off to ZM/GM (no confirmation) */}
          {tab === 'HAND_OFF' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-900">
                Routes this complaint to the designated Zone Manager (or GM if category is sensitive)
                <strong>without confirming it</strong>. The ZM can then confirm it on their end.
                Moves handler to ZM/GM; phase stays Triage.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Target Zone</label>
                <select
                  value={routeZoneId}
                  onChange={(e) => setRouteZoneId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  <option value={1}>Zone 1 (Jasmine, Lotus, Clubhouse)</option>
                  <option value={2}>Zone 2 (Rose, Lily, Marigold, Park)</option>
                  <option value={3}>Zone 3 (Tulip, Orchid, Parking, Sports Court)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Handoff Note (Optional)</label>
                <input
                  type="text"
                  value={routeNote}
                  onChange={(e) => setRouteNote(e.target.value)}
                  placeholder="e.g. Please review this ticket; zone reassignment"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <button
                type="button"
                onClick={handleHandOff}
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Handing off…' : 'Hand Off to Zone Manager / GM'}
              </button>
            </div>
          )}

          {/* TAB 2: Request Clarification */}
          {tab === 'CLARIFY' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 text-xs text-amber-900">
                Pauses the SLA clock and notifies the resident. The resident has <strong>72 hours</strong> to reply.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Question for Resident *</label>
                <textarea
                  rows={3}
                  value={clarifyQuestion}
                  onChange={(e) => setClarifyQuestion(e.target.value)}
                  placeholder="e.g. Which elevator is stuck? Is anyone trapped inside?"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-xs text-gray-900"
                />
              </div>

              <button
                type="button"
                onClick={handleRequestClarification}
                disabled={submitting || !clarifyQuestion.trim()}
                className="w-full rounded-lg bg-amber-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send Clarification Request'}
              </button>
            </div>
          )}

          {/* TAB 3: Change Category */}
          {tab === 'CATEGORY' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs text-blue-900">
                Recomputes response & resolution SLAs and updates the default trade accordingly.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">New Category *</label>
                <select
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  {categories.map((cat) => (
                    <option key={cat.category_id} value={cat.category_id}>
                      [{cat.severity}] {cat.name} ({cat.trade_name || 'GM Sensitive'})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleChangeCategory}
                disabled={submitting || newCategoryId === complaint.category_id}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Updating…' : 'Apply Category & Recalculate SLA'}
              </button>
            </div>
          )}

          {/* TAB 4: Mark Invalid */}
          {tab === 'INVALID' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-3.5 text-xs text-red-900">
                Closes the ticket as <strong>Invalid</strong>. The resident is granted a 7-day window to dispute this decision.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Justification / Reason *</label>
                <input
                  type="text"
                  value={invalidReason}
                  onChange={(e) => setInvalidReason(e.target.value)}
                  placeholder="e.g. Non-genuine / personal property dispute"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <button
                type="button"
                onClick={handleCloseInvalid}
                disabled={submitting || !invalidReason.trim()}
                className="w-full rounded-lg bg-red-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Closing…' : 'Close as Invalid'}
              </button>
            </div>
          )}

          {/* TAB 5: Mark Duplicate */}
          {tab === 'DUPLICATE' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-700">
                Closes the ticket as a duplicate and links it to an existing parent complaint.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Parent Complaint ID *</label>
                <input
                  type="number"
                  value={duplicateId}
                  onChange={(e) => setDuplicateId(e.target.value)}
                  placeholder="e.g. 15"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Duplicate Note (Optional)</label>
                <input
                  type="text"
                  value={duplicateReason}
                  onChange={(e) => setDuplicateReason(e.target.value)}
                  placeholder="e.g. Same lift outage already reported in ticket #15"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <button
                type="button"
                onClick={handleCloseDuplicate}
                disabled={submitting || !duplicateId}
                className="w-full rounded-lg bg-gray-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-black disabled:opacity-50"
              >
                {submitting ? 'Closing…' : 'Close as Duplicate'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
