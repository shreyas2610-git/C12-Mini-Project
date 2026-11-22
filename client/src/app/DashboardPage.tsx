import { useEffect } from 'react'
import { getSession } from '../session/useSession'
import { ResidentDashboard } from '../portals/resident/ResidentDashboard'
import { ZoneManagerDashboard } from '../portals/zm/ZoneManagerDashboard'

interface DashboardPageProps {
  onNavigate: (page: string) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const session = getSession()

  useEffect(() => {
    if (!session) {
      onNavigate('login')
    }
  }, [session, onNavigate])

  if (!session) {
    return null
  }

  if (session.user.role === 'ZM') {
    return <ZoneManagerDashboard user={session.user} onNavigate={onNavigate} />
  }

  return <ResidentDashboard user={session.user} onNavigate={onNavigate} />
}
