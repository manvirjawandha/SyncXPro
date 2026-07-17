// Entry component for the NATIVE driver app (Android / iOS).
//
// Deliberately driver-only: no admin dashboard, no ops portal, no marketing
// site, no routing. Those aren't just hidden — they're never imported, so the
// bundler leaves them out of the app entirely. That keeps the download small
// and, when we submit to Apple later, keeps the app a focused field tool rather
// than a mirror of the website (which is what Guideline 4.2 rejects).

import { useState, useEffect } from 'react'
import LoginScreen from './pages/LoginScreen'
import DriverApp from './pages/DriverApp'
import { Toasts, useToast } from './components/Toast'
import { api } from './lib/api'
import { isNative, onNetworkChange } from './lib/native'
import { flush } from './lib/offlineQueue'

export default function DriverShell() {
  const [user, setUser] = useState(null)
  const [stage, setStage] = useState('checking') // checking | login | app | wrongRole
  const { toasts, show: toast } = useToast()

  useEffect(() => {
    (async () => {
      if (!api.isAuthed()) { setStage('login'); return }
      try {
        const data = await api.getMe()
        if (data.user?.role !== 'driver') { setStage('wrongRole'); return }
        setUser(data.user); setStage('app')
      } catch {
        api.logout(); setStage('login')
      }
    })()
  }, [])

  // Upload anything captured offline: once on launch, then every time signal
  // comes back. The driver never has to remember to do this.
  useEffect(() => {
    if (!isNative()) return
    let unsubscribe
    let cancelled = false

    const run = async () => {
      try {
        const r = await flush()
        if (!cancelled && r.sent > 0) {
          toast(`✓ ${r.sent} saved document${r.sent > 1 ? 's' : ''} uploaded`, 'success')
        }
      } catch { /* stay quiet — it'll retry on the next reconnect */ }
    }

    ;(async () => {
      await run()
      unsubscribe = await onNetworkChange(connected => { if (connected) run() })
    })()

    return () => { cancelled = true; unsubscribe?.() }
  }, [])

  const handleLogin = (u) => {
    if (u?.role !== 'driver') { setStage('wrongRole'); return }
    setUser(u); setStage('app')
  }

  const handleLogout = () => { api.logout(); setUser(null); setStage('login') }

  if (stage === 'checking') return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</div>
    </div>
  )

  // An admin signing in here would get a broken experience, so say so plainly.
  if (stage === 'wrongRole') return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 26, maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🚛</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>This app is for drivers</div>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 18 }}>
          Company admin accounts manage documents on the SyncX Pro website. Sign in there instead.
        </div>
        <button onClick={() => { api.logout(); setUser(null); setStage('login') }}
          style={{ background: '#1a56db', color: 'white', border: 'none', borderRadius: 12, padding: '13px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
          Back to sign in
        </button>
      </div>
    </div>
  )

  return (
    <>
      <Toasts toasts={toasts} />
      {stage === 'login' && <LoginScreen onLogin={handleLogin} native />}
      {stage === 'app' && user && <DriverApp user={user} onLogout={handleLogout} toast={toast} />}
    </>
  )
}
