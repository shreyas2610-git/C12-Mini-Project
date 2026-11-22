import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  RefreshCw,
  LogOut,
  Filter,
  Search,
  UserCheck,
  RotateCcw,
  Check,
  X,
  ChevronRight,
  Info,
  CornerUpLeft,
  Flame,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react'
import { clearSession, UserSession } from '../../session/useSession'
import {
  Complaint,
  DashboardStats,
  Vendor,
  fetchZMDashboard,
  fetchZMQueue,
  fetchZMComplaints,
  fetchVendors,
  apiTakeOver,
  apiConfirm,
  apiSendBack,
  apiCloseDuplicate,
  apiAssignVendors,
  apiVerifyFix,
  apiOrderRework,
  apiDisputeDecision,
  apiEscalate,
} from '../../api/endpoints/zm'

interface ZMDashboardProps {
  user: UserSession
  onNavigate: (page: string) => void
}

type TabType = 'queue' | 'all' | 'vendors'

export function ZoneManagerDashboard({ user, onNavigate }: ZMDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('queue')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [queue, setQueue] = useState<Complaint[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters for 'all' tab
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Modal states
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null)
  const [modalType, setModalType] = useState<
    'detail' | 'assign' | 'verify' | 'rework' | 'sendback' | 'duplicate' | 'dispute' | 'escalate' | null
  >(null)

  // Action form fields
  const [assignPriority, setAssignPriority] = useState<string>('Medium')
  const [selectedVendorsByTrade, setSelectedVendorsByTrade] = useState<{ [tradeId: number]: number }>({})
  const [reworkReason, setReworkReason] = useState<string>('')
  const [sendBackCode, setSendBackCode] = useState<'Wrong zone' | 'Not genuine'>('Wrong zone')
  const [sendBackReason, setSendBackReason] = useState<string>('')
  const [duplicateOriginalId, setDuplicateOriginalId] = useState<string>('')
  const [disputeDecision, setDisputeDecision] = useState<'uphold' | 'reject'>('uphold')
  const [disputeReason, setDisputeReason] = useState<string>('')
  const [escalateReason, setEscalateReason] = useState<string>('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashData, queueData, allData, vendorData] = await Promise.all([
        fetchZMDashboard(),
        fetchZMQueue(50),
        fetchZMComplaints({
          status: filterStatus || undefined,
          priority: filterPriority || undefined,
          page: 1,
          page_size: 50,
        }),
        fetchVendors(),
      ])
      setStats(dashData)
      setQueue(queueData)
      setComplaints(allData)
      setVendors(vendorData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterPriority])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showNotification(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  function handleLogout() {
    clearSession()
    onNavigate('login')
  }

  // Action Handlers
  async function handleTakeOver(ticket: Complaint) {
    setActionLoading(true)
    try {
      await apiTakeOver(ticket.complaint_id, ticket.version)
      showNotification(`Ticket #${ticket.complaint_id} taken over to your desk.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Take over failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConfirm(ticket: Complaint) {
    setActionLoading(true)
    try {
      await apiConfirm(ticket.complaint_id, ticket.version)
      showNotification(`Ticket #${ticket.complaint_id} confirmed as genuine in ${stats?.zone_name || 'your zone'}.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Confirm failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAssignSubmit() {
    if (!selectedTicket) return
    setActionLoading(true)
    try {
      // Map trades: if ticket has no roles yet, default to plumbing or first trade
      const rolesPayload = Object.entries(selectedVendorsByTrade).map(([tradeId, vId]) => ({
        trade_id: Number(tradeId),
        vendor_id: Number(vId),
      }))

      if (rolesPayload.length === 0) {
        alert('Please assign at least one vendor.')
        setActionLoading(false)
        return
      }

      await apiAssignVendors(selectedTicket.complaint_id, selectedTicket.version, assignPriority, rolesPayload)
      showNotification(`Vendors assigned to Ticket #${selectedTicket.complaint_id} successfully.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Assignment failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleVerifySubmit() {
    if (!selectedTicket) return
    setActionLoading(true)
    try {
      await apiVerifyFix(selectedTicket.complaint_id, selectedTicket.version)
      showNotification(`Ticket #${selectedTicket.complaint_id} verified. 48-hour resident confirmation clock started.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReworkSubmit() {
    if (!selectedTicket || !reworkReason.trim()) {
      alert('Please enter instructions for the rework.')
      return
    }
    setActionLoading(true)
    try {
      await apiOrderRework(selectedTicket.complaint_id, selectedTicket.version, reworkReason)
      showNotification(`Rework ordered for Ticket #${selectedTicket.complaint_id}.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rework request failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSendBackSubmit() {
    if (!selectedTicket || !sendBackReason.trim()) {
      alert('Please enter a reason for sending back the ticket.')
      return
    }
    setActionLoading(true)
    try {
      await apiSendBack(selectedTicket.complaint_id, selectedTicket.version, sendBackCode, sendBackReason)
      showNotification(`Ticket #${selectedTicket.complaint_id} sent back with reason: ${sendBackCode}.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Send-back failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCloseDuplicateSubmit() {
    if (!selectedTicket || !duplicateOriginalId) {
      alert('Please specify the original complaint ID.')
      return
    }
    setActionLoading(true)
    try {
      await apiCloseDuplicate(selectedTicket.complaint_id, selectedTicket.version, Number(duplicateOriginalId))
      showNotification(`Ticket #${selectedTicket.complaint_id} closed as duplicate of #${duplicateOriginalId}.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Duplicate closure failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDisputeSubmit() {
    if (!selectedTicket) return
    setActionLoading(true)
    try {
      await apiDisputeDecision(selectedTicket.complaint_id, selectedTicket.version, disputeDecision, disputeReason)
      showNotification(`Dispute for Ticket #${selectedTicket.complaint_id} resolved (${disputeDecision}).`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Dispute decision failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEscalateSubmit() {
    if (!selectedTicket || !escalateReason.trim()) {
      alert('Please enter an escalation reason.')
      return
    }
    setActionLoading(true)
    try {
      await apiEscalate(selectedTicket.complaint_id, selectedTicket.version, escalateReason)
      showNotification(`Ticket #${selectedTicket.complaint_id} escalated to GM's desk.`)
      closeModal()
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Escalation failed')
    } finally {
      setActionLoading(false)
    }
  }

  function openActionModal(
    ticket: Complaint,
    type: 'detail' | 'assign' | 'verify' | 'rework' | 'sendback' | 'duplicate' | 'dispute' | 'escalate'
  ) {
    setSelectedTicket(ticket)
    setModalType(type)
    if (type === 'assign') {
      setAssignPriority(ticket.priority || ticket.category_severity || 'Medium')
      // Pre-select first vendor for each trade if available
      const pre: { [tradeId: number]: number } = {}
      if (ticket.roles && ticket.roles.length > 0) {
        ticket.roles.forEach((r) => {
          if (r.vendor_id) pre[r.trade_id] = r.vendor_id
        })
      } else {
        // default first available vendor
        if (vendors.length > 0) {
          const v = vendors[0]
          if (v.trade_ids.length > 0) pre[v.trade_ids[0]] = v.vendor_id
        }
      }
      setSelectedVendorsByTrade(pre)
    }
  }

  function closeModal() {
    setSelectedTicket(null)
    setModalType(null)
    setReworkReason('')
    setSendBackReason('')
    setDuplicateOriginalId('')
    setDisputeReason('')
    setEscalateReason('')
  }

  const filteredComplaints = complaints?.filter((c) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      c.description.toLowerCase().includes(term) ||
      (c.title && c.title.toLowerCase().includes(term)) ||
      (c.tower_name && c.tower_name.toLowerCase().includes(term)) ||
      (c.category_name && c.category_name.toLowerCase().includes(term)) ||
      String(c.complaint_id).includes(term)
    )
  }) ?? []

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">Zone Manager Portal</span>
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-700/10">
                  {stats?.zone_name || user.zone_name || 'Zone 1'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Logged in as <span className="font-medium text-slate-700">{user.full_name}</span> ({user.role})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title="Refresh Queue and Metrics"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Success / Info Toast */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg animate-bounce">
          <CheckCircle2 className="h-5 w-5" />
          <span>{successMsg}</span>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Metric Overview Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Total in Zone</span>
              <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_zone_complaints}</p>
              <span className="text-xs text-slate-400">All-time lifetime</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Active Open</span>
              <p className="mt-1 text-2xl font-bold text-indigo-600">{stats.open_complaints}</p>
              <span className="text-xs text-slate-400">In workflow</span>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
              <span className="text-xs font-medium text-amber-700">Triage Queue</span>
              <p className="mt-1 text-2xl font-bold text-amber-900">{stats.triage_count}</p>
              <span className="text-xs text-amber-600">Needs review/confirm</span>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
              <span className="text-xs font-medium text-blue-700">In Verification</span>
              <p className="mt-1 text-2xl font-bold text-blue-900">{stats.verifying_count}</p>
              <span className="text-xs text-blue-600">Work done by vendor</span>
            </div>

            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs">
              <span className="text-xs font-medium text-purple-700">Disputed</span>
              <p className="mt-1 text-2xl font-bold text-purple-900">{stats.disputed_count}</p>
              <span className="text-xs text-purple-600">Resident appeal</span>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-red-700">Breached SLA</span>
                <Flame className="h-4 w-4 text-red-600" />
              </div>
              <p className="mt-1 text-2xl font-bold text-red-900">{stats.breached_count}</p>
              <span className="text-xs text-red-600">High priority alerts</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'queue'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            Priority Action Queue (Rule C11)
            {queue.length > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                {queue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'all'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Filter className="h-4 w-4" />
            All Zone Complaints
          </button>

          <button
            onClick={() => setActiveTab('vendors')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'vendors'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="h-4 w-4" />
            Vendors Load & Capacity
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: ACTION QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Immediate Action Queue</h3>
                <p className="text-xs text-slate-500">
                  Tickets needing your decision, sorted deterministically by Queue Score S (Severity × Urgency) + FIFO.
                </p>
              </div>
              <span className="text-xs text-slate-400">Total in queue: {queue.length}</span>
            </div>

            {loading && queue.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : queue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h4 className="mt-3 text-base font-semibold text-slate-900">Your Action Queue is Clear!</h4>
                <p className="mt-1 text-sm text-slate-500">
                  No tickets currently require immediate Zone Manager review in {stats?.zone_name || 'this zone'}.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {queue.map((item) => {
                  const isBreached = item.queue_score && item.queue_score >= 10
                  const isTriage = item.phase === 'Triage'
                  const isVerifying = item.phase === 'Verifying'
                  const isDisputed = item.status === 'Disputed'

                  return (
                    <div
                      key={item.complaint_id}
                      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Left Title & Location */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{item.complaint_id}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                item.priority === 'Critical'
                                  ? 'bg-red-100 text-red-700'
                                  : item.priority === 'High'
                                  ? 'bg-amber-100 text-amber-700'
                                  : item.priority === 'Low'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {item.priority || item.category_severity || 'Medium'}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {item.category_name}
                            </span>
                            {item.status === 'Disputed' ? (
                              <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                                Disputed
                              </span>
                            ) : (
                              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                {item.status} / {item.phase || 'N/A'}
                              </span>
                            )}
                            {isBreached && (
                              <span className="flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                <Flame className="h-3 w-3" /> SLA BREACH
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                            {item.description}
                          </h4>

                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>
                              📍{' '}
                              {item.location_type === 'Flat'
                                ? `Tower ${item.tower_name || ''} - Flat ${item.flat_number || ''}`
                                : `Common Area: ${item.common_area_name || ''}`}
                            </span>
                            <span>•</span>
                            <span>
                              Queue Score S: <strong className="text-slate-800">{item.queue_score ?? 'N/A'}</strong>
                            </span>
                            <span>•</span>
                            <span>Handler: <strong className="text-slate-700">{item.handler}</strong></span>
                          </div>
                        </div>

                        {/* Right Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
                          {isTriage && (
                            <>
                              <button
                                onClick={() => handleConfirm(item)}
                                disabled={actionLoading}
                                className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                              >
                                <Check className="h-3.5 w-3.5" /> Confirm
                              </button>
                              <button
                                onClick={() => openActionModal(item, 'assign')}
                                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                              >
                                Assign Vendors
                              </button>
                              <button
                                onClick={() => openActionModal(item, 'sendback')}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                              >
                                <CornerUpLeft className="h-3.5 w-3.5" /> Send Back
                              </button>
                            </>
                          )}

                          {isVerifying && (
                            <>
                              <button
                                onClick={() => openActionModal(item, 'verify')}
                                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Verify Fix
                              </button>
                              <button
                                onClick={() => openActionModal(item, 'rework')}
                                className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Order Rework
                              </button>
                            </>
                          )}

                          {isDisputed && (
                            <button
                              onClick={() => openActionModal(item, 'dispute')}
                              className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition"
                            >
                              Resolve Dispute
                            </button>
                          )}

                          {item.handler !== 'ZM' && (
                            <button
                              onClick={() => handleTakeOver(item)}
                              disabled={actionLoading}
                              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Take Over
                            </button>
                          )}

                          <button
                            onClick={() => openActionModal(item, 'detail')}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ALL ZONE COMPLAINTS */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by description, ID, tower..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="">All Statuses</option>
                  <option value="Reported">Reported</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Closed">Closed</option>
                  <option value="Disputed">Disputed</option>
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="">All Priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            {/* Complaints Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Complaint</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status / Phase</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Handler</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComplaints.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No complaints match your filters in this zone.
                      </td>
                    </tr>
                  ) : (
                    filteredComplaints.map((c) => (
                      <tr key={c.complaint_id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-mono font-medium text-slate-500">#{c.complaint_id}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 line-clamp-1">{c.description}</p>
                          <span className="text-[11px] text-slate-400">{c.category_name}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {c.location_type === 'Flat'
                            ? `T-${c.tower_name} F-${c.flat_number}`
                            : c.common_area_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {c.status} {c.phase ? `(${c.phase})` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              c.priority === 'Critical'
                                ? 'bg-red-100 text-red-700'
                                : c.priority === 'High'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">{c.handler}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openActionModal(c, 'detail')}
                            className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 transition"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: VENDORS LOAD & CAPACITY */}
        {activeTab === 'vendors' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Vendors & Trade Capacities</h3>
              <p className="text-xs text-slate-500">
                Live workload monitoring of all active township contractors. Sorted by highest available free slots.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => {
                const loadPercent = Math.min(100, Math.round((v.current_load / (v.capacity || 1)) * 100))
                const isFull = v.free_slots <= 0

                return (
                  <div
                    key={v.vendor_id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900">{v.company_name}</h4>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.trade_names.map((t, idx) => (
                            <span
                              key={idx}
                              className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isFull
                            ? 'bg-red-100 text-red-700'
                            : v.free_slots <= 1
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {isFull ? 'Full' : `${v.free_slots} slots free`}
                      </span>
                    </div>

                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Current Load: {v.current_load}</span>
                        <span>Capacity: {v.capacity} jobs</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full transition-all ${
                            loadPercent >= 100
                              ? 'bg-red-500'
                              : loadPercent >= 75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${loadPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}

      {/* 1. TICKET DETAIL MODAL */}
      {modalType === 'detail' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-slate-400">
                  Complaint #{selectedTicket.complaint_id}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{selectedTicket.category_name}</h3>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-xs space-y-2">
              <p className="text-sm font-medium text-slate-800">{selectedTicket.description}</p>
              <div className="grid grid-cols-2 gap-2 text-slate-500 pt-2 border-t border-slate-200">
                <div>
                  <strong>Location: </strong>
                  {selectedTicket.location_type === 'Flat'
                    ? `Tower ${selectedTicket.tower_name} Flat ${selectedTicket.flat_number}`
                    : selectedTicket.common_area_name}
                </div>
                <div>
                  <strong>Status / Phase: </strong>
                  {selectedTicket.status} ({selectedTicket.phase || 'N/A'})
                </div>
                <div>
                  <strong>Priority: </strong>
                  {selectedTicket.priority || selectedTicket.category_severity}
                </div>
                <div>
                  <strong>Handler: </strong>
                  {selectedTicket.handler}
                </div>
                <div>
                  <strong>Reopen Count: </strong>
                  {selectedTicket.reopen_count} / 2
                </div>
                <div>
                  <strong>Send-Back Count: </strong>
                  {selectedTicket.send_back_count}
                </div>
              </div>
            </div>

            {/* Assigned Roles */}
            {selectedTicket.roles.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Assigned Roles</h4>
                <div className="space-y-2">
                  {selectedTicket.roles.map((r) => (
                    <div
                      key={r.ticket_role_id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{r.trade_name}</span>
                        <p className="text-slate-500">{r.vendor_name || 'No vendor assigned yet'}</p>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {r.role_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Action Buttons inside Details */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              {selectedTicket.phase === 'Triage' && (
                <>
                  <button
                    onClick={() => handleConfirm(selectedTicket)}
                    disabled={actionLoading}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Confirm Genuine
                  </button>
                  <button
                    onClick={() => openActionModal(selectedTicket, 'assign')}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Assign Vendors
                  </button>
                  <button
                    onClick={() => openActionModal(selectedTicket, 'sendback')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Send Back
                  </button>
                  <button
                    onClick={() => openActionModal(selectedTicket, 'duplicate')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close as Duplicate
                  </button>
                </>
              )}

              {selectedTicket.phase === 'Verifying' && (
                <>
                  <button
                    onClick={() => openActionModal(selectedTicket, 'verify')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Verify Fix
                  </button>
                  <button
                    onClick={() => openActionModal(selectedTicket, 'rework')}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Order Rework
                  </button>
                </>
              )}

              <button
                onClick={() => openActionModal(selectedTicket, 'escalate')}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Escalate to GM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ASSIGN VENDORS MODAL */}
      {modalType === 'assign' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Assign Vendors — Complaint #{selectedTicket.complaint_id}
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Set Priority</label>
              <select
                value={assignPriority}
                onChange={(e) => setAssignPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800"
              >
                <option value="Low">Low (168h SLA)</option>
                <option value="Medium">Medium (72h SLA)</option>
                <option value="High">High (48h SLA)</option>
                <option value="Critical">Critical (24h SLA - 2h vendor reply)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Select Vendor</label>
              <select
                onChange={(e) => {
                  const [tradeId, vId] = e.target.value.split(':').map(Number)
                  setSelectedVendorsByTrade((prev) => ({ ...prev, [tradeId]: vId }))
                }}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800"
              >
                <option value="">Choose an active vendor with free capacity...</option>
                {vendors.map((v) => (
                  <option
                    key={v.vendor_id}
                    value={`${v.trade_ids[0] || 1}:${v.vendor_id}`}
                    disabled={v.free_slots <= 0}
                  >
                    {v.company_name} ({v.trade_names.join(', ')}) — {v.free_slots} slots free ({v.current_load}/
                    {v.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. VERIFY FIX MODAL */}
      {modalType === 'verify' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Verify Completed Repair</h3>
            <p className="text-xs text-slate-500">
              Confirming this repair will move Ticket #{selectedTicket.complaint_id} to <strong>Under Review / Confirming</strong> and start the resident's 48-hour confirmation clock.
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifySubmit}
                disabled={actionLoading}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {actionLoading ? 'Verifying...' : 'Verify Fix'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. REWORK MODAL */}
      {modalType === 'rework' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Order Rework from Vendor</h3>
            <p className="text-xs text-slate-500">
              Reopen count: <strong>{selectedTicket.reopen_count} / 2</strong>. If rework is ordered a 3rd time, the ticket will automatically escalate to the General Manager.
            </p>
            <textarea
              placeholder="Explain why the repair was inadequate and what needs to be fixed..."
              value={reworkReason}
              onChange={(e) => setReworkReason(e.target.value)}
              className="w-full h-24 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReworkSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                {actionLoading ? 'Submitting...' : 'Send Back for Rework'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SEND BACK MODAL */}
      {modalType === 'sendback' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Send Back to Helpdesk Coordinator</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason Code</label>
              <select
                value={sendBackCode}
                onChange={(e) => setSendBackCode(e.target.value as 'Wrong zone' | 'Not genuine')}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-800"
              >
                <option value="Wrong zone">Wrong zone (belongs to another zone)</option>
                <option value="Not genuine">Not genuine (unclear or spurious report)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Details / Clarification</label>
              <textarea
                placeholder="Describe why this ticket is being returned..."
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                className="w-full h-20 rounded-lg border border-slate-200 p-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendBackSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
              >
                {actionLoading ? 'Sending...' : 'Confirm Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CLOSE DUPLICATE MODAL */}
      {modalType === 'duplicate' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Close as Duplicate</h3>
            <p className="text-xs text-slate-500">
              Link this report to the open original complaint currently being serviced.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Original Complaint ID</label>
              <input
                type="number"
                placeholder="e.g. 42"
                value={duplicateOriginalId}
                onChange={(e) => setDuplicateOriginalId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDuplicateSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
              >
                {actionLoading ? 'Closing...' : 'Close as Duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. DISPUTE MODAL */}
      {modalType === 'dispute' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decide Resident Dispute</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="radio"
                  name="dispute_decision"
                  checked={disputeDecision === 'uphold'}
                  onChange={() => setDisputeDecision('uphold')}
                />
                Uphold Dispute (Reopen ticket to Triage on your desk)
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="radio"
                  name="dispute_decision"
                  checked={disputeDecision === 'reject'}
                  onChange={() => setDisputeDecision('reject')}
                />
                Reject Dispute (Confirm Closure)
              </label>
            </div>
            <textarea
              placeholder="Reason / Notes for dispute decision..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full h-20 rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                {actionLoading ? 'Saving...' : 'Submit Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. ESCALATE MODAL */}
      {modalType === 'escalate' && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Escalate to General Manager</h3>
            <p className="text-xs text-slate-500">
              Transfers full authority for Complaint #{selectedTicket.complaint_id} to the GM's desk.
            </p>
            <textarea
              placeholder="Mandatory escalation reason..."
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              className="w-full h-24 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalateSubmit}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {actionLoading ? 'Escalating...' : 'Escalate to GM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
