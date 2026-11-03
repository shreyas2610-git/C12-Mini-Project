import { useState } from 'react'
import { registerUser } from '../../../api/endpoints/auth'
import { saveSession } from '../../../session/useSession'

interface SignUpForm {
  full_name: string
  email: string
  phone: string
  password: string
  role_id: number
  flat_id: number | null
  company_name: string
  capacity: string
  trade_ids: number[]
}

interface UseSignUpOptions {
  onSuccess: () => void
}

export function useSignUp({ onSuccess }: UseSignUpOptions) {
  const [form, setForm] = useState<SignUpForm>({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role_id: 0,
    flat_id: null,
    company_name: '',
    capacity: '',
    trade_ids: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof SignUpForm>(key: K, value: SignUpForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload: Parameters<typeof registerUser>[0] = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role_id: form.role_id,
      }
      if (form.role_id === 1 && form.flat_id !== null) {
        payload.flat_id = form.flat_id
      }
      if (form.role_id === 4) {
        if (form.company_name) payload.company_name = form.company_name
        if (form.capacity !== '') payload.capacity = parseInt(form.capacity, 10)
        if (form.trade_ids.length > 0) payload.trade_ids = form.trade_ids
      }
      const data = await registerUser(payload)
      saveSession(data.access_token, data.refresh_token, {
        user_id: data.user_id,
        full_name: data.full_name,
        role: data.role,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return { form, setField, loading, error, handleSubmit }
}
