import { LogOut, Building2, User } from 'lucide-react'
import { clearSession } from '../../session/useSession'

interface ResidentDashboardProps {
  user: { full_name: string; role: string }
  onNavigate: (page: string) => void
}

export function ResidentDashboard({ user, onNavigate }: ResidentDashboardProps) {
  function handleLogout() {
    clearSession()
    onNavigate('login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-base font-semibold text-gray-900">C12 Society Portal</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-100">
              <User className="h-8 w-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Welcome, {user.full_name}!
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                You are signed in as a{' '}
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {user.role}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-gray-50 p-6 ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">
              Your dashboard is being built. More features will appear here soon. 🚀
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
