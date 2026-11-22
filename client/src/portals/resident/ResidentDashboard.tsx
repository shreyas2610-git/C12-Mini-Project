import { useState, useEffect } from 'react'
import {
  Building2,
  LogOut,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import { clearSession } from '../../session/useSession'
import {
  Complaint,
  UserProfile,
  fetchComplaints,
  fetchUserProfile,
} from '../../api/endpoints/complaints'
import { NewComplaintModal } from './NewComplaintModal'
import { ComplaintDetailModal } from './ComplaintDetailModal'
import { SlaBadge } from '../../shared/SlaBadge'

interface ResidentDashboardProps {
  user: { full_name: string; role: string }
  onNavigate: (page: string) => void
}

export function ResidentDashboard({ user, onNavigate }: ResidentDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'ACTION_NEEDED' | 'CLOSED'>('ALL')
  const [search, setSearch] = useState('')

  // Modals
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null)

  function loadData() {
    setLoading(true)
    setError(null)
    Promise.all([fetchUserProfile(), fetchComplaints()])
      .then(([prof, list]) => {
        setProfile(prof)
        setComplaints(list)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  function handleLogout() {
    clearSession()
    onNavigate('login')
  }

  // Derived counts
  const totalCount = complaints.length
  const activeCount = complaints.filter((c) => c.status !== 'Closed').length
  const actionNeededCount = complaints.filter(
    (c) => c.phase === 'Awaiting Resident' || c.phase === 'Confirming'
  ).length
  const resolvedCount = complaints.filter((c) => c.status === 'Closed').length

  // Filtered complaints
  const filtered = complaints.filter((c) => {
    // Tab filter
    if (activeTab === 'ACTIVE' && c.status === 'Closed') return false
    if (activeTab === 'CLOSED' && c.status !== 'Closed') return false
    if (activeTab === 'ACTION_NEEDED' && c.phase !== 'Awaiting Resident' && c.phase !== 'Confirming')
      return false

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchTitle = (c.title || '').toLowerCase().includes(q)
      const matchCategory = c.category_name.toLowerCase().includes(q)
      const matchId = c.complaint_id.toString().includes(q)
      const matchDesc = c.description.toLowerCase().includes(q)
      return matchTitle || matchCategory || matchId || matchDesc
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-xs">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900">Township Resident Portal</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  Resident
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {profile?.tower_name
                  ? `Flat ${profile.flat_number}, ${profile.tower_name} Tower (Zone ${profile.zone_id})`
                  : 'Society Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-medium text-gray-700">
              {profile?.full_name || user.full_name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-xs hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Raised</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="mt-1 text-xs text-gray-500">Lifetime complaints</div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Active Work</div>
            <div className="mt-2 text-2xl font-bold text-blue-900">{activeCount}</div>
            <div className="mt-1 text-xs text-blue-600">In triage, progress or review</div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Needs Your Action</div>
            <div className="mt-2 text-2xl font-bold text-amber-900">{actionNeededCount}</div>
            <div className="mt-1 text-xs text-amber-700 font-medium">Clarification or confirmation</div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Resolved</div>
            <div className="mt-2 text-2xl font-bold text-emerald-900">{resolvedCount}</div>
            <div className="mt-1 text-xs text-emerald-600">Closed or fixed</div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-1 text-xs font-medium shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'ALL'
                  ? 'bg-indigo-600 font-semibold text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTION_NEEDED')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'ACTION_NEEDED'
                  ? 'bg-amber-600 font-semibold text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Action Needed ({actionNeededCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'ACTIVE'
                  ? 'bg-blue-600 font-semibold text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CLOSED')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeTab === 'CLOSED'
                  ? 'bg-gray-800 font-semibold text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Closed ({resolvedCount})
            </button>
          </div>

          {/* Search & Raise Button */}
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket #, title, trade…"
              className="w-full sm:w-64 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={loadData}
              title="Refresh complaints"
              className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 shadow-xs hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              Raise Complaint
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-xs text-red-700 ring-1 ring-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Complaints Table / List */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading your complaints…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">No complaints found</h3>
              <p className="mt-1 text-xs text-gray-500">
                {search ? 'No complaints match your search query.' : 'You have no complaints under this tab.'}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Raise Your First Complaint
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const needsClarification = c.phase === 'Awaiting Resident'
                const needsConfirm = c.phase === 'Confirming'

                return (
                  <div
                    key={c.complaint_id}
                    onClick={() => setSelectedComplaintId(c.complaint_id)}
                    className="flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50/80 cursor-pointer"
                  >
                    {/* Left: Info */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-500">
                          #{c.complaint_id}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          {c.category_name}
                        </span>
                        {c.urgent_flag && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            <Zap className="h-2.5 w-2.5 fill-red-600" /> URGENT
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">
                          • {new Date(c.submitted_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-gray-900 truncate">
                        {c.title || c.category_name}
                      </div>

                      <p className="text-xs text-gray-500 line-clamp-1">{c.description}</p>

                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          {c.common_area_name
                            ? c.common_area_name
                            : `Flat ${c.flat_number}, ${c.tower_name}`}
                        </span>
                        <span>•</span>
                        <span>Desk: <strong>{c.handler}</strong></span>
                        {c.roles.length > 0 && (
                          <>
                            <span>•</span>
                            <span>
                              Trade: <strong>{c.roles.map((r) => r.trade_name).join(', ')}</strong>
                            </span>
                          </>
                        )}
                        {c.status !== 'Closed' && (
                          <>
                            <span>•</span>
                            <SlaBadge
                              dueAt={c.status === 'Reported' ? c.response_due_at : c.resolution_due_at}
                              labelPrefix={c.status === 'Reported' ? 'Response due' : 'Target'}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Badges & Action indicators */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                      {needsClarification ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-300 animate-pulse">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          Action: Reply Needed
                        </span>
                      ) : needsConfirm ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-300 animate-pulse">
                          <Clock className="h-3.5 w-3.5 text-blue-600" />
                          Action: Confirm Fix
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            c.status === 'Closed'
                              ? 'bg-gray-100 text-gray-700'
                              : c.status === 'In Progress'
                                ? 'bg-blue-50 text-blue-700'
                                : c.status === 'Under Review'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {c.status}
                          {c.phase ? ` (${c.phase})` : ''}
                        </span>
                      )}

                      <div className="text-[11px] text-gray-500">
                        Score: <span className="font-bold text-indigo-700">{c.priority_score} pts</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showNewModal && (
        <NewComplaintModal
          userProfile={profile}
          onClose={() => setShowNewModal(false)}
          onSuccess={(id) => {
            setShowNewModal(false)
            loadData()
            setSelectedComplaintId(id)
          }}
        />
      )}

      {selectedComplaintId !== null && (
        <ComplaintDetailModal
          complaintId={selectedComplaintId}
          onClose={() => setSelectedComplaintId(null)}
          onRefresh={loadData}
        />
      )}
    </div>
  )
}
