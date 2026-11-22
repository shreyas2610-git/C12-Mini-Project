import { useState, useEffect } from 'react'
import {
  Building2,
  LogOut,
  RefreshCw,
  AlertCircle,
  Zap,
  MapPin,
  Clock,
  Layers,
  ArrowRight,
  Filter,
  AlertTriangle,
  Flame,
  ShieldAlert,
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react'
import { clearSession } from '../../../session/useSession'
import {
  Category,
  Complaint,
  fetchCategories,
  fetchComplaints,
  fetchTriageQueue,
} from '../../../api/endpoints/complaints'
import { Trade, fetchTrades } from '../../../api/endpoints/lookup'
import { TriageActionModal } from './TriageActionModal'
import { ComplaintDetailModal } from '../../resident/ComplaintDetailModal'
import { SlaBadge } from '../../../shared/SlaBadge'

interface CoordinatorDashboardProps {
  user: { full_name: string; role: string }
  onNavigate: (page: string) => void
}

type ViewMode = 'QUEUE' | 'URGENT' | 'OVERDUE' | 'AWAITING' | 'SENSITIVE' | 'ALL'

export function CoordinatorDashboard({ user, onNavigate }: CoordinatorDashboardProps) {
  const [queue, setQueue] = useState<Complaint[]>([])
  const [allComplaints, setAllComplaints] = useState<Complaint[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Primary Queue Tabs
  const [viewMode, setViewMode] = useState<ViewMode>('QUEUE')

  // Refined Dropdown Filters
  const [zoneFilter, setZoneFilter] = useState<number | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<number | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<string | 'ALL'>('ALL')
  const [levelFilter, setLevelFilter] = useState<number | 'ALL'>('ALL')
  const [search, setSearch] = useState('')

  // Modals
  const [triageTarget, setTriageTarget] = useState<Complaint | null>(null)
  const [detailComplaintId, setDetailComplaintId] = useState<number | null>(null)

  function loadAll() {
    setLoading(true)
    setError(null)
    const z = zoneFilter === 'ALL' ? undefined : zoneFilter

    Promise.all([
      fetchTriageQueue(z),
      fetchComplaints({ zone_id: z }),
      fetchCategories(),
      fetchTrades(),
    ])
      .then(([qList, allList, cats, trs]) => {
        setQueue(qList)
        setAllComplaints(allList)
        setCategories(cats)
        setTrades(trs)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAll()
  }, [zoneFilter])

  function handleLogout() {
    clearSession()
    onNavigate('login')
  }

  // Helper checkers
  function isBreached(c: Complaint): boolean {
    const now = Date.now()
    if (c.status === 'Reported' && c.response_due_at) {
      return new Date(c.response_due_at).getTime() < now
    }
    if (c.status !== 'Closed' && c.resolution_due_at) {
      return new Date(c.resolution_due_at).getTime() < now
    }
    return false
  }

  function isSensitive(c: Complaint): boolean {
    if (c.handler === 'GM') return true
    const cat = (c.category_name || '').toLowerCase()
    return cat.includes('security') || cat.includes('harassment') || cat.includes('theft')
  }

  // Summary Metrics (scoped by active zone selector)
  const zoneScoped = allComplaints.filter((c) =>
    zoneFilter === 'ALL' ? true : c.zone_id === zoneFilter
  )

  const pendingTriageCount = zoneScoped.filter((c) => c.status === 'Reported').length
  const urgentCount = zoneScoped.filter((c) => c.urgent_flag || c.level === 5).length
  const overdueCount = zoneScoped.filter(isBreached).length
  const inExecutionCount = zoneScoped.filter(
    (c) => c.status === 'In Progress' || c.status === 'Escalated'
  ).length
  const awaitingCount = zoneScoped.filter((c) => c.phase === 'Awaiting Resident').length
  const sensitiveCount = zoneScoped.filter(isSensitive).length
  const totalTownshipCount = zoneScoped.length

  // Filter Pipeline:
  // 1. View Mode Tab
  let filtered = zoneScoped
  if (viewMode === 'QUEUE') {
    filtered = zoneScoped.filter((c) => c.status === 'Reported')
  } else if (viewMode === 'URGENT') {
    filtered = zoneScoped.filter((c) => c.urgent_flag || c.level === 5)
  } else if (viewMode === 'OVERDUE') {
    filtered = zoneScoped.filter(isBreached)
  } else if (viewMode === 'AWAITING') {
    filtered = zoneScoped.filter((c) => c.phase === 'Awaiting Resident')
  } else if (viewMode === 'SENSITIVE') {
    filtered = zoneScoped.filter(isSensitive)
  }

  // 2. Dropdowns (Category, Status, Level)
  filtered = filtered.filter((c) => {
    if (categoryFilter !== 'ALL' && c.category_id !== categoryFilter) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (levelFilter !== 'ALL' && c.level !== levelFilter) return false
    return true
  })

  // 3. Search Filter & Sort by priority_score DESC
  const displayed = filtered
    .filter((c) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        (c.title || '').toLowerCase().includes(q) ||
        c.category_name.toLowerCase().includes(q) ||
        c.complaint_id.toString().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.zone_name.toLowerCase().includes(q) ||
        (c.tower_name && c.tower_name.toLowerCase().includes(q)) ||
        (c.flat_number && c.flat_number.toLowerCase().includes(q)) ||
        (c.common_area_name && c.common_area_name.toLowerCase().includes(q)) ||
        (c.handler && c.handler.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => b.priority_score - a.priority_score)

  const hasActiveFilters =
    categoryFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    levelFilter !== 'ALL' ||
    search.trim().length > 0

  function clearAllFilters() {
    setCategoryFilter('ALL')
    setStatusFilter('ALL')
    setLevelFilter('ALL')
    setSearch('')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 shadow-xs">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900">Township Central Desk</span>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                  Coordinator
                </span>
              </div>
              <p className="text-xs text-gray-500">Triage Queue, Verification & Routing Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-semibold text-gray-700">
              {user.full_name}
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

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Metric Cards (Clickable) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* 1. Triage Queue */}
          <div
            onClick={() => setViewMode('QUEUE')}
            className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
              viewMode === 'QUEUE'
                ? 'border-purple-500 bg-purple-50/70 ring-2 ring-purple-500/20'
                : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                Triage Queue
              </span>
              <Zap className="h-4 w-4 text-amber-600 fill-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-amber-950">{pendingTriageCount}</div>
            <div className="mt-0.5 text-[11px] text-amber-700 font-medium">Pending intake verification</div>
          </div>

          {/* 2. Urgent / Critical */}
          <div
            onClick={() => setViewMode('URGENT')}
            className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
              viewMode === 'URGENT'
                ? 'border-red-500 bg-red-50/80 ring-2 ring-red-500/20'
                : 'border-red-200 bg-red-50/40 hover:bg-red-50/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-red-800">
                Urgent & Lvl 5
              </span>
              <Flame className="h-4 w-4 text-red-600 fill-red-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-red-950">{urgentCount}</div>
            <div className="mt-0.5 text-[11px] text-red-700 font-medium">Critical safety hazards</div>
          </div>

          {/* 3. SLA Breached */}
          <div
            onClick={() => setViewMode('OVERDUE')}
            className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
              viewMode === 'OVERDUE'
                ? 'border-rose-500 bg-rose-50/80 ring-2 ring-rose-500/20'
                : 'border-rose-200 bg-rose-50/40 hover:bg-rose-50/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
                SLA Breached
              </span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-rose-950">{overdueCount}</div>
            <div className="mt-0.5 text-[11px] text-rose-700 font-medium">Response/target overdue</div>
          </div>

          {/* 4. In Execution */}
          <div
            onClick={() => {
              setViewMode('ALL')
              setStatusFilter('In Progress')
            }}
            className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
              viewMode === 'ALL' && statusFilter === 'In Progress'
                ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/20'
                : 'border-blue-100 bg-blue-50/40 hover:bg-blue-50/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-800">
                In Execution
              </span>
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-blue-950">{inExecutionCount}</div>
            <div className="mt-0.5 text-[11px] text-blue-700 font-medium">With Zone Managers/vendors</div>
          </div>

          {/* 5. Township Total */}
          <div
            onClick={() => {
              setViewMode('ALL')
              setStatusFilter('ALL')
            }}
            className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
              viewMode === 'ALL' && statusFilter === 'ALL'
                ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900/10'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Total Township
              </span>
              <Layers className="h-4 w-4 text-gray-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{totalTownshipCount}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">All registered complaints</div>
          </div>
        </div>

        {/* ── QUEUE TABS ── */}
        <div className="mt-6 flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
          {/* Triage Queue */}
          <button
            type="button"
            onClick={() => setViewMode('QUEUE')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'QUEUE'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            Triage Queue
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'QUEUE' ? 'bg-purple-800 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {pendingTriageCount}
            </span>
          </button>

          {/* Urgent / Level 5 */}
          <button
            type="button"
            onClick={() => setViewMode('URGENT')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'URGENT'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-red-50 hover:text-red-700'
            }`}
          >
            <Flame className="h-3.5 w-3.5 fill-current" />
            Urgent / Level 5
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'URGENT' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-800'
              }`}
            >
              {urgentCount}
            </span>
          </button>

          {/* SLA Breached */}
          <button
            type="button"
            onClick={() => setViewMode('OVERDUE')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'OVERDUE'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-gray-600 hover:bg-rose-50 hover:text-rose-700'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            SLA Breached
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'OVERDUE' ? 'bg-rose-900 text-white' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {overdueCount}
            </span>
          </button>

          {/* Awaiting Clarification */}
          <button
            type="button"
            onClick={() => setViewMode('AWAITING')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'AWAITING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-amber-50 hover:text-amber-800'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Awaiting Resident
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'AWAITING' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {awaitingCount}
            </span>
          </button>

          {/* GM Sensitive */}
          <button
            type="button"
            onClick={() => setViewMode('SENSITIVE')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'SENSITIVE'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-800'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            GM Sensitive
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'SENSITIVE' ? 'bg-indigo-900 text-white' : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {sensitiveCount}
            </span>
          </button>

          {/* All Township Tickets */}
          <button
            type="button"
            onClick={() => setViewMode('ALL')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              viewMode === 'ALL'
                ? 'bg-gray-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            All Township Tickets
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                viewMode === 'ALL' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {totalTownshipCount}
            </span>
          </button>
        </div>

        {/* ── FILTER TOOLBAR ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white p-3 shadow-xs">
          {/* Zone Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/50 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-gray-500">Zone:</span>
            <select
              value={zoneFilter}
              onChange={(e) =>
                setZoneFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="border-none bg-transparent pr-2 text-xs font-bold text-gray-800 focus:outline-none"
            >
              <option value="ALL">All Zones</option>
              <option value={1}>Zone 1 (Jasmine, Lotus)</option>
              <option value={2}>Zone 2 (Rose, Lily, Marigold)</option>
              <option value={3}>Zone 3 (Tulip, Orchid)</option>
            </select>
          </div>

          {/* Specific Category Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/50 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-gray-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="max-w-[180px] truncate border-none bg-transparent pr-2 text-xs font-bold text-gray-800 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.category_id} value={cat.category_id}>
                  {cat.name} (Lvl {cat.level})
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/50 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-gray-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-none bg-transparent pr-2 text-xs font-bold text-gray-800 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Reported">Reported (New)</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Escalated">Escalated</option>
              <option value="Closed">Closed</option>
              <option value="Disputed">Disputed</option>
            </select>
          </div>

          {/* Severity Level Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/50 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-gray-500">Severity:</span>
            <select
              value={levelFilter}
              onChange={(e) =>
                setLevelFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="border-none bg-transparent pr-2 text-xs font-bold text-gray-800 focus:outline-none"
            >
              <option value="ALL">All Levels</option>
              <option value={5}>Lvl 5 (Critical - 60pts)</option>
              <option value={4}>Lvl 4 (Major - 48pts)</option>
              <option value={3}>Lvl 3 (Moderate - 36pts)</option>
              <option value={2}>Lvl 2 (Minor - 24pts)</option>
              <option value={1}>Lvl 1 (Routine - 12pts)</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="ml-auto flex flex-1 sm:max-w-xs items-center gap-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keyword, ticket #, flat…"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadAll}
            title="Refresh dataset"
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 shadow-xs hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              title="Reset all filters"
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 shadow-xs"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-xs text-red-700 ring-1 ring-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── COMPLAINTS LIST ── */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading complaints…</div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">
                No matching complaints found
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Try selecting a different filter or clearing search keywords.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear Active Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayed.map((c) => {
                const canTriage = c.status === 'Reported' && c.handler === 'Coordinator'

                return (
                  <div
                    key={c.complaint_id}
                    className="flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:justify-between hover:bg-purple-50/20"
                  >
                    {/* Left: Metadata & Descriptions */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-500">
                          #{c.complaint_id}
                        </span>

                        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800">
                          {c.category_name}
                        </span>

                        {c.urgent_flag && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            <Zap className="h-2.5 w-2.5 fill-red-600" /> URGENT
                          </span>
                        )}

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.level === 5
                              ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                              : c.level === 4
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          Lvl {c.level} ({c.severity})
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.status === 'Reported'
                              ? 'bg-purple-100 text-purple-800'
                              : c.status === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : c.status === 'Escalated'
                                  ? 'bg-amber-100 text-amber-800'
                                  : c.status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : c.status === 'Disputed'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {c.status}
                          {c.phase ? ` (${c.phase})` : ''}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-gray-900 truncate">
                        {c.title || c.category_name}
                      </div>

                      <p className="text-xs text-gray-600 line-clamp-1">{c.description}</p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          {c.common_area_name
                            ? c.common_area_name
                            : `Flat ${c.flat_number}, ${c.tower_name}`}
                        </span>
                        <span>•</span>
                        <span>Zone: <strong>{c.zone_name}</strong></span>
                        <span>•</span>
                        <span>Desk: <strong>{c.handler}</strong></span>
                        <span>•</span>
                        <SlaBadge
                          dueAt={c.status === 'Reported' ? c.response_due_at : c.resolution_due_at}
                          labelPrefix={c.status === 'Reported' ? 'Response due in' : 'Target'}
                        />
                      </div>
                    </div>

                    {/* Right: Score & Actions */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] text-gray-400">Score</div>
                        <div className="text-base font-extrabold text-purple-700">
                          {c.priority_score} pts
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailComplaintId(c.complaint_id)}
                          title="Inspect full audit timeline & attachments"
                          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
                        >
                          <Eye className="h-3.5 w-3.5 text-gray-500" />
                          View
                        </button>

                        {canTriage && (
                          <button
                            type="button"
                            onClick={() => setTriageTarget(c)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition"
                          >
                            Triage
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Triage Action Modal */}
      {triageTarget && (
        <TriageActionModal
          complaint={triageTarget}
          categories={categories}
          onClose={() => setTriageTarget(null)}
          onSuccess={() => {
            setTriageTarget(null)
            loadAll()
          }}
        />
      )}

      {/* Full Detail Modal (Read-only for Coordinator Inspection) */}
      {detailComplaintId && (
        <ComplaintDetailModal
          complaintId={detailComplaintId}
          readOnly={true}
          onClose={() => setDetailComplaintId(null)}
          onRefresh={() => {
            loadAll()
          }}
        />
      )}
    </div>
  )
}
