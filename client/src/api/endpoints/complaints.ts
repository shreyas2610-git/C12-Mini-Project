const BASE = 'http://localhost:8000/api/v1'

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface Category {
  category_id: number
  name: string
  severity: string
  level: number
  severity_points: number
  response_sla_h: number
  resolution_sla_h: number
  is_sensitive: boolean
  default_trade_id?: number | null
  trade_name?: string | null
}

export interface CommonArea {
  common_area_id: number
  name: string
  zone_id: number
  zone_name: string
}

export interface UserProfile {
  user_id: number
  role_id: number
  role_name: string
  full_name: string
  email: string
  flat_id?: number | null
  flat_number?: string | null
  tower_id?: number | null
  tower_name?: string | null
  zone_id?: number | null
}

export interface TicketRole {
  ticket_role_id: number
  trade_id: number
  trade_name: string
  vendor_id?: number | null
  company_name?: string | null
  role_status: string
}

export interface StatusHistory {
  history_id: number
  event_type: string
  from_value?: string | null
  to_value: string
  actor_role_name: string
  reason?: string | null
  occurred_at: string
}

export interface Attachment {
  attachment_id: number
  file_ref: string
  caption?: string | null
  uploaded_at: string
}

export interface Complaint {
  complaint_id: number
  title?: string | null
  description: string
  category_id: number
  category_name: string
  severity: string
  level: number
  priority_score: number
  urgent_flag: boolean
  recurring_flag: boolean
  escalated_flag: boolean
  status: string
  phase?: string | null
  handler: string
  flat_id?: number | null
  flat_number?: string | null
  tower_name?: string | null
  common_area_id?: number | null
  common_area_name?: string | null
  zone_id: number
  zone_name: string
  submitted_at: string
  response_due_at: string
  resolution_due_at?: string | null
  clarification_question?: string | null
  clarification_reply?: string | null
  clarification_due_at?: string | null
  reopen_count: number
  resolution?: string | null
  resolution_note?: string | null
  roles: TicketRole[]
  history?: StatusHistory[]
  attachments?: Attachment[]
}

export interface CreateComplaintInput {
  category_id: number
  title?: string
  description: string
  location_type: 'FLAT' | 'COMMON_AREA'
  common_area_id?: number | null
  urgent_flag?: boolean
  attachment_url?: string | null
  caption?: string | null
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/categories`, { headers: getHeaders() })
  if (!res.ok) throw new Error('Failed to load categories')
  return res.json()
}

export async function fetchCommonAreas(): Promise<CommonArea[]> {
  const res = await fetch(`${BASE}/common-areas`, { headers: getHeaders() })
  if (!res.ok) throw new Error('Failed to load common areas')
  return res.json()
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const res = await fetch(`${BASE}/users/me`, { headers: getHeaders() })
  if (!res.ok) throw new Error('Failed to load user profile')
  return res.json()
}

// ── Complaints ───────────────────────────────────────────────────────────────

export async function createComplaint(data: CreateComplaintInput): Promise<{ complaint_id: number }> {
  const res = await fetch(`${BASE}/complaints`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create complaint' }))
    throw new Error(err.detail ?? 'Failed to create complaint')
  }
  return res.json()
}

export async function fetchComplaints(params?: { status?: string; phase?: string; zone_id?: number }): Promise<Complaint[]> {
  const url = new URL(`${BASE}/complaints`)
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.phase) url.searchParams.set('phase', params.phase)
  if (params?.zone_id) url.searchParams.set('zone_id', params.zone_id.toString())

  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) throw new Error('Failed to load complaints')
  return res.json()
}

export async function fetchTriageQueue(zoneId?: number): Promise<Complaint[]> {
  const url = new URL(`${BASE}/complaints/queue`)
  if (zoneId) url.searchParams.set('zone_id', zoneId.toString())

  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) throw new Error('Failed to load triage queue')
  return res.json()
}

export async function fetchComplaintDetail(id: number): Promise<Complaint> {
  const res = await fetch(`${BASE}/complaints/${id}`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to load complaint #${id}`)
  return res.json()
}

// ── Resident Actions ──────────────────────────────────────────────────────────

export async function replyClarification(id: number, reply_text: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/reply`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reply_text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to submit clarification' }))
    throw new Error(err.detail ?? 'Failed to submit clarification')
  }
}

export async function withdrawComplaint(id: number): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/withdraw`, {
    method: 'POST',
    headers: getHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to withdraw complaint' }))
    throw new Error(err.detail ?? 'Failed to withdraw complaint')
  }
}

export async function confirmFix(id: number, note?: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/confirm-fix`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ note }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to confirm fix' }))
    throw new Error(err.detail ?? 'Failed to confirm fix')
  }
}

export async function rejectFix(id: number, reason: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/reject-fix`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to reject fix' }))
    throw new Error(err.detail ?? 'Failed to reject fix')
  }
}

export async function disputeClosure(id: number, reason: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/dispute`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to dispute closure' }))
    throw new Error(err.detail ?? 'Failed to dispute closure')
  }
}

// ── Coordinator Actions ───────────────────────────────────────────────────────

export async function requestClarification(id: number, question: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/request-clarification`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to request clarification' }))
    throw new Error(err.detail ?? 'Failed to request clarification')
  }
}

export async function closeInvalid(id: number, reason: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/close-invalid`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to close as invalid' }))
    throw new Error(err.detail ?? 'Failed to close as invalid')
  }
}

export async function closeDuplicate(id: number, duplicate_of: number, reason?: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/close-duplicate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ duplicate_of, reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to close as duplicate' }))
    throw new Error(err.detail ?? 'Failed to close as duplicate')
  }
}

export async function confirmAndRoute(id: number, zone_id?: number, note?: string): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/confirm`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ zone_id, note }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to confirm and route complaint' }))
    throw new Error(err.detail ?? 'Failed to confirm and route complaint')
  }
}

export async function changeCategory(id: number, category_id: number): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/category`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ category_id }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to change category' }))
    throw new Error(err.detail ?? 'Failed to change category')
  }
}

export async function addTradeRole(id: number, trade_id: number): Promise<void> {
  const res = await fetch(`${BASE}/complaints/${id}/roles`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ trade_id }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to add trade role' }))
    throw new Error(err.detail ?? 'Failed to add trade role')
  }
}
