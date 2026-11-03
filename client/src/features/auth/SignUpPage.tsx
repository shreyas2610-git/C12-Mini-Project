import { useState } from 'react'
import { Eye, EyeOff, Building2 } from 'lucide-react'
import { useSignUp } from './hooks/useSignUp'
import { ResidentFields } from './components/ResidentFields'
import { VendorFields } from './components/VendorFields'

const ROLES = [
  { label: 'Resident', value: 1 },
  { label: 'Coordinator', value: 2 },
  { label: 'Zone Manager', value: 3 },
  { label: 'Vendor', value: 4 },
  { label: 'General Manager', value: 5 },
]

interface SignUpPageProps {
  onNavigate: (page: 'login' | 'signup' | 'dashboard') => void
}

export function SignUpPage({ onNavigate }: SignUpPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [residentTowerId, setResidentTowerId] = useState<number | null>(null)

  const { form, setField, loading, error, handleSubmit } = useSignUp({
    onSuccess: () => onNavigate('dashboard'),
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Join the C12 Society Portal</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white px-8 py-8 shadow-sm ring-1 ring-gray-200">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Full Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setField('full_name', e.target.value)}
                placeholder="Arjun Sharma"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="arjun@example.com"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+91 98765 43210"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={form.role_id === 0 ? '' : form.role_id}
                onChange={(e) => {
                  const val = e.target.value
                  setField('role_id', val === '' ? 0 : Number(val))
                  setField('flat_id', null)
                  setField('company_name', '')
                  setField('capacity', '')
                  setField('trade_ids', [])
                  setResidentTowerId(null)
                }}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">Select your role</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Resident-specific fields */}
            {form.role_id === 1 && (
              <div className="rounded-xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Resident Details
                </p>
                <ResidentFields
                  towerId={residentTowerId}
                  flatId={form.flat_id}
                  onTowerChange={(id) => {
                    setResidentTowerId(id)
                    setField('flat_id', null)
                  }}
                  onFlatChange={(id) => setField('flat_id', id)}
                />
              </div>
            )}

            {/* Vendor-specific fields */}
            {form.role_id === 4 && (
              <div className="rounded-xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Vendor Details
                </p>
                <VendorFields
                  companyName={form.company_name}
                  capacity={form.capacity}
                  selectedTradeIds={form.trade_ids}
                  onCompanyChange={(v) => setField('company_name', v)}
                  onCapacityChange={(v) => setField('capacity', v)}
                  onTradeToggle={(id) =>
                    setField(
                      'trade_ids',
                      form.trade_ids.includes(id)
                        ? form.trade_ids.filter((t) => t !== id)
                        : [...form.trade_ids, id],
                    )
                  }
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
