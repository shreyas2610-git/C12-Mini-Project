const BASE = 'http://localhost:8000/api/v1'

export interface RegisterPayload {
  full_name: string
  email: string
  phone: string
  password: string
  role_id: number
  flat_id?: number
  company_name?: string
  capacity?: number
  trade_ids?: number[]
}

export interface LoginPayload {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user_id: number
  full_name: string
  role: string
}

export async function registerUser(payload: RegisterPayload): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail ?? 'Registration failed')
  }
  return res.json()
}

export async function loginUser(payload: LoginPayload): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail ?? 'Login failed')
  }
  return res.json()
}
