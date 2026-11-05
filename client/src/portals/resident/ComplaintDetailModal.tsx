import { useState, useEffect } from 'react'
import {
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Image as ImageIcon,
  Send,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import {
  Complaint,
  confirmFix,
  disputeClosure,
  fetchComplaintDetail,
  rejectFix,
  replyClarification,
  withdrawComplaint,
} from '../../api/endpoints/complaints'
import { SlaBadge } from '../../shared/SlaBadge'

interface ComplaintDetailModalProps {
  complaintId: number
  onClose: () => void
  onRefresh: () => void
  readOnly?: boolean
}

export function ComplaintDetailModal({
  complaintId,
  onClose,
  onRefresh,
  readOnly = false,
}: ComplaintDetailModalProps) {
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState(false)

  // Action form inputs
  const [replyText, setReplyText] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [confirmNote, setConfirmNote] = useState('')

  function loadDetails() {
    setLoading(true)
    fetchComplaintDetail(complaintId)
      .then(setComplaint)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDetails()
  }, [complaintId])

  async function handleReply() {
    if (!replyText.trim()) return
    setSubmittingAction(true)
    setActionError(null)
    try {
      await replyClarification(complaintId, replyText)
      setActionSuccess('Clarification sent successfully!')
      setReplyText('')
      loadDetails()
      onRefresh()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  async function handleConfirmFix() {
    setSubmittingAction(true)
    setActionError(null)
    try {
      await confirmFix(complaintId, confirmNote || undefined)
      setActionSuccess('Fix confirmed! Complaint closed.')
      loadDetails()
      onRefresh()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  async function handleRejectFix() {
    if (!rejectReason.trim()) {
      setActionError('Please specify why the fix is rejected.')
      return
    }
    setSubmittingAction(true)
    setActionError(null)
    try {
      await rejectFix(complaintId, rejectReason)
      setActionSuccess('Fix rejected. Ticket returned for rework.')
      setRejectReason('')
      loadDetails()
      onRefresh()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  async function handleWithdraw() {
    if (!confirm('Are you sure you want to withdraw this complaint?')) return
    setSubmittingAction(true)
    setActionError(null)
    try {
      await withdrawComplaint(complaintId)
      setActionSuccess('Complaint withdrawn.')
      loadDetails()
      onRefresh()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) {
      setActionError('Please state the reason for disputing this closure.')
      return
    }
    setSubmittingAction(true)
    setActionError(null)
    try {
      await disputeClosure(complaintId, disputeReason)
      setActionSuccess('Dispute submitted successfully!')
      setDisputeReason('')
      loadDetails()
      onRefresh()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-200 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-gray-500">#{complaintId}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {complaint?.category_name}
              </span>
              {complaint?.urgent_flag && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                  URGENT
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">
              {complaint?.title || complaint?.category_name || 'Complaint Details'}
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

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading complaint details…</div>
        ) : complaint ? (
          <div className="mt-6 space-y-6">
            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100 text-xs">
              <div>
                <span className="text-gray-400">Status</span>
                <div className="mt-0.5 font-bold text-gray-900">{complaint.status}</div>
                {complaint.phase && (
                  <span className="text-[11px] text-indigo-600">({complaint.phase})</span>
                )}
              </div>
              <div>
                <span className="text-gray-400">Priority Score</span>
                <div className="mt-0.5 font-bold text-indigo-600">{complaint.priority_score} pts</div>
                <span className="text-[11px] text-gray-500">{complaint.severity}</span>
              </div>
              <div>
                <span className="text-gray-400">Location</span>
                <div className="mt-0.5 font-semibold text-gray-900">
                  {complaint.common_area_name
                    ? complaint.common_area_name
                    : `Flat ${complaint.flat_number}, ${complaint.tower_name}`}
                </div>
                <span className="text-[11px] text-gray-500">{complaint.zone_name}</span>
              </div>
              <div>
                <span className="text-gray-400">Handler Desk</span>
                <div className="mt-0.5 font-semibold text-gray-900">{complaint.handler}</div>
                <span className="text-[11px] text-gray-500">
                  {new Date(complaint.submitted_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* SLA Status Tracker */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500">Response SLA:</span>
                {complaint.status !== 'Reported' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Triaged
                  </span>
                ) : (
                  <SlaBadge dueAt={complaint.response_due_at} labelPrefix="Target" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500">Resolution SLA:</span>
                {complaint.status === 'Closed' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Resolved
                  </span>
                ) : (
                  <SlaBadge dueAt={complaint.resolution_due_at} labelPrefix="Target" />
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description
              </h3>
              <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap rounded-lg border border-gray-100 bg-white p-3 shadow-xs">
                {complaint.description}
              </p>
            </div>

            {/* Assigned Trades & Roles */}
            {complaint.roles.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Assigned Trades & Vendors
                </h3>
                <div className="mt-2 space-y-1.5">
                  {complaint.roles.map((r) => (
                    <div
                      key={r.ticket_role_id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{r.trade_name}</span>
                        {r.company_name ? (
                          <span className="text-gray-500">({r.company_name})</span>
                        ) : (
                          <span className="text-gray-400 italic">No vendor assigned yet</span>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          r.role_status === 'Done'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.role_status === 'In Progress'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {r.role_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {complaint.attachments && complaint.attachments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Attachments
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {complaint.attachments.map((att) => (
                    <div key={att.attachment_id} className="rounded-lg border border-gray-200 p-2 text-xs">
                      <div className="text-gray-700 font-medium truncate">{att.file_ref}</div>
                      {att.caption && <div className="text-gray-400 text-[11px] mt-0.5">{att.caption}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ACTIVE ACTION BANNERS ── */}

            {/* 1. Clarification Requested */}
            {complaint.phase === 'Awaiting Resident' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h4 className="text-sm font-bold text-amber-900">
                      {readOnly
                        ? 'Clarification Requested from Resident (SLA Paused)'
                        : 'Clarification Requested by Coordinator'}
                    </h4>
                    <p className="mt-1 text-xs text-amber-800 font-medium bg-white/70 p-2.5 rounded-lg border border-amber-200">
                      "{complaint.clarification_question || 'Please provide additional details about the issue.'}"
                    </p>
                    {!readOnly ? (
                      <div className="mt-3">
                        <textarea
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your response to the coordinator here…"
                          className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                        <button
                          type="button"
                          onClick={handleReply}
                          disabled={submittingAction || !replyText.trim()}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
                        >
                          <Send className="h-3 w-3" />
                          Submit Clarification
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-amber-700">
                        Resident has 72 hours to respond before the SLA clock resumes or expires.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Confirming Fix */}
            {complaint.phase === 'Confirming' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex items-start gap-2.5">
                  <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h4 className="text-sm font-bold text-blue-900">
                      Work Completed — {readOnly ? 'Awaiting Resident Verification' : 'Please Verify'}
                    </h4>
                    <p className="mt-0.5 text-xs text-blue-700">
                      {readOnly
                        ? 'The vendor has reported completion. The resident has 48 hours to verify and confirm.'
                        : 'The assigned vendor has marked this issue as finished. Please test and confirm.'}
                    </p>

                    {!readOnly && (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmFix}
                            disabled={submittingAction}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirm Fix (Mark Resolved)
                          </button>
                        </div>

                        <div className="mt-3 pt-3 border-t border-blue-200/60">
                          <span className="text-xs font-semibold text-gray-700">Issue still not fixed?</span>
                          <div className="mt-1.5 flex gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason work is incomplete (e.g. tap still dripping)"
                              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleRejectFix}
                              disabled={submittingAction || !rejectReason.trim()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Request Rework
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Withdraw Option (when Reported) */}
            {!readOnly && complaint.status === 'Reported' && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                <span>Issue resolved by yourself or no longer needed?</span>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={submittingAction}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-red-600 hover:bg-red-50"
                >
                  Withdraw Complaint
                </button>
              </div>
            )}

            {/* 4. Dispute Option (when Closed as Duplicate / Invalid / Unresolved) */}
            {!readOnly &&
              complaint.status === 'Closed' &&
              ['Duplicate', 'Invalid', 'Unresolved'].includes(complaint.resolution || '') && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                    <div className="w-full">
                      <h4 className="text-sm font-bold text-purple-900">
                        Dispute Closure ({complaint.resolution})
                      </h4>
                      <p className="mt-0.5 text-xs text-purple-700">
                        If you disagree with this closure verdict, you have 7 days to lodge an appeal with township management.
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <input
                          type="text"
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                          placeholder="Explain why this decision is incorrect…"
                          className="flex-1 rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleDispute}
                          disabled={submittingAction || !disputeReason.trim()}
                          className="rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          Lodge Dispute
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ── Status History Timeline ── */}
            {complaint.history && complaint.history.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Timeline & Audit Log
                </h3>
                <div className="mt-2 border-l-2 border-gray-200 pl-4 space-y-3">
                  {complaint.history.map((h) => (
                    <div key={h.history_id} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{h.to_value}</span>
                        <span className="text-[11px] text-gray-400">by {h.actor_role_name}</span>
                        <span className="text-[11px] text-gray-400">• {new Date(h.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {h.reason && <div className="mt-0.5 text-gray-600 italic">"{h.reason}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

