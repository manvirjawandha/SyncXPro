import { useState, useEffect } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'

// Landing page for the admin reset link emailed in step A:
//   /reset?token=XXX&company=COYYYYYY
// Flow: validate link → send OTP to the company phone → enter code + new
// password. The email proves control of the inbox; the OTP proves control of
// the phone. Both are required to change the admin password.
export default function ResetPage({ onDone }) {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || ''
  const companyId = params.get('company') || ''

  const [step, setStep] = useState('start') // start | code | done | invalid
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token || !companyId) setStep('invalid')
  }, [])

  const sendCode = async () => {
    setErr(''); setLoading(true)
    try {
      const r = await api.adminResetSendCode(token, companyId)
      if (r.sent) { setMaskedPhone(r.maskedPhone); setStep('code') }
      else setErr('Could not send a code.')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const confirm = async () => {
    if (!code.trim()) { setErr('Enter the code'); return }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return }
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    setErr(''); setLoading(true)
    try {
      await api.adminResetConfirm({ token, companyId, code: code.trim(), newPassword: pw })
      setStep('done')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>SyncX Pro</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Reset company password</div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24 }}>
          {step === 'invalid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Invalid reset link</div>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 18 }}>
                This link is missing information or has already been used. Request a new one from the sign-in page.
              </p>
              <a href="/login" style={{ ...S.btn('#1a56db'), display: 'block', textDecoration: 'none', textAlign: 'center' }}>Go to sign in</a>
            </div>
          )}

          {step === 'start' && (
            <>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 18 }}>
                To confirm it's you, we'll text a verification code to your company phone. Tap below to send it.
              </p>
              {err && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
              <button onClick={sendCode} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
                {loading ? 'Sending…' : 'Send code to my phone'}
              </button>
            </>
          )}

          {step === 'code' && (
            <>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
                We sent a 6-digit code to <b>{maskedPhone}</b>. Enter it and choose a new password.
              </p>
              <L>Verification code</L>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6}
                placeholder="123456" style={{ ...S.input, marginBottom: 12, letterSpacing: 3, fontFamily: 'monospace' }} disabled={loading} />
              <L>New password</L>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password"
                placeholder="At least 6 characters" style={{ ...S.input, marginBottom: 12 }} disabled={loading} />
              <L>Repeat password</L>
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password"
                placeholder="Repeat new password" style={{ ...S.input, marginBottom: 14 }} disabled={loading} />
              {err && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
              <button onClick={confirm} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Password updated</div>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 18 }}>
                Your company password has been changed. Sign in with your new password.
              </p>
              <a href="/login" style={{ ...S.btn('#1a56db'), display: 'block', textDecoration: 'none', textAlign: 'center' }}>Go to sign in</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const L = ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>{children}</div>
