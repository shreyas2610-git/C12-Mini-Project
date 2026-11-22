export interface UserSession {
  user_id: number
  full_name: string
  role: string
  zone_id?: number | null
  zone_name?: string | null
}

export function saveSession(
  token: string,
  refreshToken: string,
  user: UserSession,
) {
  localStorage.setItem('access_token', token)
  localStorage.setItem('refresh_token', refreshToken)
  localStorage.setItem('user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

export function getSession(): { token: string; user: UserSession } | null {
  const token = localStorage.getItem('access_token')
  const raw = localStorage.getItem('user')
  if (!token || !raw) return null
  return { token, user: JSON.parse(raw) as UserSession }
}
