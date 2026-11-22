const BASE = 'http://localhost:8000/api/v1/complaints'

function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: 'Network error or invalid response' }))
    throw new Error(errorBody.detail || `Request failed with status ${res.status}`)
  }

  return res.json()
}

export interface RoleItem {
  ticket_role_id: number
  trade_id: number
  trade_name: string
  vendor_id?: number | null
  vendor_name?: string | null
  role_status: string
  done_note?: string | null
}

export interface Complaint {
  complaint_id: number
  title?: string | null
  description: string
  status: string
  phase?: string | null
  handler: string
  priority?: string | null
  priority_score?: number | null
  submitted_at: string
  response_due_at?: string | null
  resolution_due_at?: string | null
  confirm_due_at?: string | null
  zone_id: number
  zone_name?: string | null
  location_type: 'Flat' | 'CommonArea'
  tower_name?: string | null
  flat_number?: string | null
  common_area_name?: string | null
  category_id: number
  category_name?: string | null
  category_severity?: string | null
  confirmed_by?: number | null
  confirmed_at?: string | null
  send_back_count: number
  send_back_reason?: string | null
  reopen_count: number
  resolution?: string | null
  resolution_note?: string | null
  escalated_flag: boolean
  recurring_flag: boolean
  duplicate_of?: number | null
  version: number
  queue_score?: number | null
  roles: RoleItem[]
}

export interface Vendor {
  vendor_id: number
  company_name: string
  capacity: number
  current_load: number
  free_slots: number
  trade_ids: number[]
  trade_names: string[]
}

export interface DashboardStats {
  total_zone_complaints: number
  open_complaints: number
  triage_count: number
  assigned_count: number
  verifying_count: number
  disputed_count: number
  breached_count: number
  zone_id: number
  zone_name: string
}

export async function fetchZMDashboard(): Promise<DashboardStats> {
  return request<DashboardStats>(`${BASE}/dashboard`)
}

export async function fetchZMQueue(limit = 50): Promise<Complaint[]> {
  return request<Complaint[]>(`${BASE}/queue?limit=${limit}`)
}

export async function fetchZMComplaints(params?: {
  status?: string
  phase?: string
  handler?: string
  priority?: string
  page?: number
  page_size?: number
}): Promise<Complaint[]> {
  const query = new URLSearchParams()
  if (params?.status) query.append('status', params.status)
  if (params?.phase) query.append('phase', params.phase)
  if (params?.handler) query.append('handler', params.handler)
  if (params?.priority) query.append('priority', params.priority)
  if (params?.page) query.append('page', String(params.page))
  if (params?.page_size) query.append('page_size', String(params.page_size))

  return request<Complaint[]>(`${BASE}?${query.toString()}`)
}

export async function fetchComplaintById(id: number): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}`)
}

export async function fetchVendors(): Promise<Vendor[]> {
  return request<Vendor[]>(`${BASE}/vendors`)
}

export async function apiTakeOver(id: number, version: number): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/take-over`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function apiConfirm(id: number, version: number): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/zm-confirm`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function apiSendBack(
    id: number,
    version: number,
    reason_code: 'Wrong zone' | 'Not genuine',
    reason: string
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/send-back`, {
    method: 'POST',
    body: JSON.stringify({ version, reason_code, reason }),
  })
}

export async function apiCloseDuplicate(
    id: number,
    version: number,
    original_id: number
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/close-duplicate`, {
    method: 'POST',
    body: JSON.stringify({ version, original_id }),
  })
}

export async function apiAssignVendors(
    id: number,
    version: number,
    priority: string,
    roles: Array<{ trade_id: number; vendor_id: number }>
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ version, priority, roles }),
  })
}

export async function apiVerifyFix(
    id: number,
    version: number,
    note?: string
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/verify`, {
    method: 'POST',
    body: JSON.stringify({ version, note }),
  })
}

export async function apiOrderRework(
    id: number,
    version: number,
    reason: string
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/rework`, {
    method: 'POST',
    body: JSON.stringify({ version, reason }),
  })
}

export async function apiDisputeDecision(
    id: number,
    version: number,
    decision: 'uphold' | 'reject',
    reason?: string
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/dispute-decision`, {
    method: 'POST',
    body: JSON.stringify({ version, decision, reason }),
  })
}

export async function apiEscalate(
    id: number,
    version: number,
    reason: string
): Promise<Complaint> {
  return request<Complaint>(`${BASE}/${id}/escalate`, {
    method: 'POST',
    body: JSON.stringify({ version, reason }),
  })
}
