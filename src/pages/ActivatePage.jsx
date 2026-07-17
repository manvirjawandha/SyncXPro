import { useState, useEffect } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'

// Defined at module scope on purpose. If this lived inside ActivatePage it would
// be a NEW function on every render, so React would treat it as a different
// component type, tear down the subtree, and remount it — which makes inputs
// lose focus after every single keystroke.
function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>SyncX Pro</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Account activation</div>
        </div>
        <div style={{ background: 'white', borderRadius: 16, padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

// Client-facing activation, reached via the emailed link:
//   /activate?token=XXX&company=COYYYYYY
// Flow: verify phone (SMS code) → set password → account active + logged in.
export default function ActivatePage({ onActivated, toast }) {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || ''
  const company = (params.get('company') || '').toUpperCase()

  const [stage, setStage] = useState('loading') // loading | error | verify | password | done
  const [info, setInfo] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      if (!token || !company) { setStage('error'); setErrorMsg('This activation link is incomplete.'); return }
      try {
        const d = await api.getActivation(token, company)
        setInfo(d)
        // If phone verification isn't available/needed, skip straight to password
        setStage(d.phoneVerificationAvailable && d.hasPhone ? 'verify' : 'password')
      } catch (e) { setStage('error'); setErrorMsg(e.message) }
    })()
  }, [])

  const sendCode = async () => {
    setBusy(true)
    try {
      await api.sendActivationCode(token, company)
      setCodeSent(true)
      toast('Verification code sent by SMS', 'success')
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  const verifyAndContinue = () => {
    if (!code.trim()) { toast('Enter the code from the SMS', 'error'); return }
    // We don't verify the code separately — it's checked at completion along
    // with the password, so just advance to the password step.
    setStage('password')
  }

  const complete = async () => {
    if (password.length < 8) { toast('Password must be at least 8 characters', 'error'); return }
    if (password !== confirmPw) { toast('Passwords do not match', 'error'); return }
    setBusy(true)
    try {
      const needsCode = info?.phoneVerificationAvailable && info?.hasPhone
      const data = await api.completeActivation(token, company, needsCode ? code : '', password)
      setStage('done')
      toast('✓ Account activated!', 'success')
      setTimeout(() => onActivated(data.user), 1200)
    } catch (e) {
      toast(e.message, 'error')
      // If the code was wrong, send them back to the verify step
      if (String(e.message).toLowerCase().includes('code')) setStage('verify')
    }
    setBusy(false)
  }

  if (stage === 'loading') return <Shell><div style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>Loading…</div></Shell>

  if (stage === 'error') return (
    <Shell>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Activation Problem</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>{errorMsg}</div>
        <a href="/" style={{ ...S.btn('#1a56db'), display: 'block', textDecoration: 'none', textAlign: 'center' }}>Go to Login</a>
      </div>
    </Shell>
  )

  if (stage === 'done') return (
    <Shell>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>Account Activated!</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Signing you in…</div>
      </div>
    </Shell>
  )

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Welcome, {info?.companyName}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Username: <b style={{ fontFamily: 'monospace' }}>{info?.adminUsername}</b></div>
      </div>

      {stage === 'verify' && (
        <div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
            To confirm it's you, we'll text a code to your phone {info?.maskedPhone ? <b>({info.maskedPhone})</b> : ''}.
          </div>
          {!codeSent ? (
            <button onClick={sendCode} disabled={busy} style={{ ...S.btn('#1a56db'), width: '100%' }}>{busy ? 'Sending…' : 'Send Verification Code'}</button>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Enter the 6-digit code</div>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...S.input, marginBottom: 12, fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace' }} />
              <button onClick={verifyAndContinue} disabled={busy} style={{ ...S.btn('#1a56db'), width: '100%', marginBottom: 10 }}>Continue</button>
              <button onClick={sendCode} disabled={busy} style={{ background: 'none', border: 'none', color: '#1a56db', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Resend code</button>
            </>
          )}
        </div>
      )}

      {stage === 'password' && (
        <div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 14 }}>Choose a password for your account.</div>
          <form autoComplete="off" onSubmit={e => { e.preventDefault(); complete() }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>New Password <span style={{ fontWeight: 400, color: '#9ca3af' }}>(min 8 characters)</span></div>
            <input type="password" autoComplete="new-password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...S.input, marginBottom: 12 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Confirm Password</div>
            <input type="password" autoComplete="new-password" placeholder="Re-enter password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={{ ...S.input, marginBottom: 20 }} />
            <button type="submit" disabled={busy} style={{ ...S.btn('#0e9f6e'), width: '100%' }}>{busy ? 'Activating…' : 'Activate Account'}</button>
          </form>
        </div>
      )}
    </Shell>
  )
}
