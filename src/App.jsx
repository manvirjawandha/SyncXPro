// src/App.jsx
import { useState, useEffect } from 'react'
import LoginScreen from './pages/LoginScreen'
import AdminDashboard from './pages/AdminDashboard'
import DriverApp from './pages/DriverApp'
import OpsPortal from './pages/OpsPortal'
import ActivatePage from './pages/ActivatePage'
import ContactPage from './pages/ContactPage'
import ResetPage from './pages/ResetPage'
import LandingPage from './pages/LandingPage'
import { Toasts, useToast } from './components/Toast'
import { api } from './lib/api'

export default function App() {
  const [user, setUser] = useState(null)
  const [stage, setStage] = useState('checking') // checking | landing | login | app
  const { toasts, show: toast } = useToast()

  // Path-based routes for the operator portal and client activation. These are
  // separate from the normal user app so they don't require an existing session.
  const path = window.location.pathname

  useEffect(() => {
    // Don't bother checking user session on the ops/activate/contact routes
    if (path.startsWith('/ops') || path.startsWith('/activate') || path.startsWith('/contact') || path.startsWith('/reset')) { setStage('route'); return }
    // Signed-out visitors get the marketing site at "/" and the login form at "/login".
    const signedOutStage = path.startsWith('/login') ? 'login' : 'landing'
    ;(async () => {
      if (!api.isAuthed()) { setStage(signedOutStage); return }
      try {
        const data = await api.getMe()
        setUser(data.user); setStage('app')
      } catch {
        api.logout(); setStage(signedOutStage)
      }
    })()
  }, [])

  const handleLogin = (u) => {
    window.history.replaceState({}, '', '/')
    setUser(u); setStage('app')
  }
  const handleLogout = () => {
    api.logout(); setUser(null); setStage('landing')
    window.history.replaceState({}, '', '/')
  }

  // Operator portal
  if (path.startsWith('/ops')) return (<><Toasts toasts={toasts} /><OpsPortal toast={toast} /></>)

  // Public contact / signup request
  if (path.startsWith('/contact')) return (<><Toasts toasts={toasts} /><ContactPage toast={toast} /></>)

  // Admin password reset (from emailed link)
  if (path.startsWith('/reset')) return (<><Toasts toasts={toasts} /><ResetPage /></>)

  // Client activation — on success, drop them into the app as the new admin
  if (path.startsWith('/activate')) return (
    <>
      <Toasts toasts={toasts} />
      <ActivatePage toast={toast} onActivated={(u) => { window.history.replaceState({}, '', '/'); setUser(u); setStage('app') }} />
    </>
  )

  if (stage === 'checking' || stage === 'route') return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14 }}>Loading…</div>
    </div>
  )

  return (
    <>
      <Toasts toasts={toasts} />
      {stage === 'landing' && <LandingPage />}
      {stage === 'login' && <LoginScreen onLogin={handleLogin} />}
      {stage === 'app' && (user?.role === 'admin' || user?.role === 'staff') && <AdminDashboard user={user} onLogout={handleLogout} toast={toast} />}
      {stage === 'app' && user?.role === 'driver' && <DriverApp user={user} onLogout={handleLogout} toast={toast} />}
    </>
  )
}
