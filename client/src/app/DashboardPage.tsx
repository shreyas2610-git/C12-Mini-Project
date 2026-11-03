import { useEffect } from 'react'
import { getSession } from '../session/useSession'
import { ResidentDashboard } from '../portals/resident/ResidentDashboard'

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

  return <ResidentDashboard user={session.user} onNavigate={onNavigate} />
}
