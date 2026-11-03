import { useState } from 'react'
import { LoginPage } from '../features/auth/LoginPage'
import { SignUpPage } from '../features/auth/SignUpPage'
import { DashboardPage } from './DashboardPage'

type Page = 'login' | 'signup' | 'dashboard'

function getInitialPage(): Page {
  return localStorage.getItem('access_token') ? 'dashboard' : 'login'
}

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage)

  function onNavigate(next: string) {
    setPage(next as Page)
  }

  if (page === 'signup') {
    return <SignUpPage onNavigate={onNavigate} />
  }

  if (page === 'dashboard') {
    return <DashboardPage onNavigate={onNavigate} />
  }

  return <LoginPage onNavigate={onNavigate} />
}
