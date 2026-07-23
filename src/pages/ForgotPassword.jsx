import { useState } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'

// Reached from the "Forgot password?" link on the login screen.
// Two audiences, chosen by a toggle:
//   • Driver → enter username, get an SMS code, set a new password in place.
//   • Admin  → enter company email, we send a reset link to that email.
//             (The link lands on ResetPage, which does the OTP-to-phone step.)
export default function ForgotPassword({ onBack, native = false }) {
  const [who, setWho] = useState('driver') // 'driver' | 'admin'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>SyncX Pro</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Reset your password</div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24 }}>
          {/* Audience toggle — hidden in the native app, which is drivers only. */}
          {!native && (
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 18 }}>
              {[['driver', 'Driver'], ['admin', 'Company admin']].map(([id, label]) => (
                <button key={id} onClick={() => setWho(id)} style={{
                  flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: who === id ? 'white' : 'transparent', color: who === id ? '#1a56db' : '#6b7280',
                  boxShadow: who === id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{label}</button>
              ))}
            </div>
          )}

          {who === 'driver' ? <DriverReset onBack={onBack} /> : <AdminReset onBack={onBack} />}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Driver: username → SMS code → new password ───────────────────────────────
function DriverReset({ onBack }) {
  const [step, setStep] = useState('request') // request | confirm | done
  const [username, setUsername] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const request = async () => {
    if (!username.trim()) { setErr('Enter your username'); return }
    setErr(''); setLoading(true)
    try {
      const r = await api.driverResetRequest(username.trim())
      if (r.sent) { setMaskedPhone(r.maskedPhone); setStep('confirm') }
      else setErr("We couldn't send a code. Your account may not have a phone number on file — ask your company admin to reset your password.")
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const confirm = async () => {
    if (!code.trim()) { setErr('Enter the code'); return }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return }
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    setErr(''); setLoading(true)
    try {
      await api.driverResetConfirm({ username: username.trim(), code: code.trim(), newPassword: pw })
      setStep('done')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  if (step === 'done') return <Done onBack={onBack} />

  return (
    <>
      {step === 'request' && <>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 16 }}>
          Enter your username and we'll text a verification code to the phone number on your account.
        </p>
        <Label>Username</Label>
        <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username"
          placeholder="your username" style={{ ...S.input, marginBottom: 14 }} disabled={loading} />
        {err && <ErrText>{err}</ErrText>}
        <button onClick={request} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
          {loading ? 'Sending…' : 'Send code'}
        </button>
      </>}

      {step === 'confirm' && <>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 16 }}>
          We sent a 6-digit code to <b>{maskedPhone}</b>. Enter it below and choose a new password.
        </p>
        <Label>Verification code</Label>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6}
          placeholder="123456" style={{ ...S.input, marginBottom: 12, letterSpacing: 3, fontFamily: 'monospace' }} disabled={loading} />
        <Label>New password</Label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password"
          placeholder="At least 6 characters" style={{ ...S.input, marginBottom: 12 }} disabled={loading} />
        <Label>Repeat password</Label>
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password"
          placeholder="Repeat new password" style={{ ...S.input, marginBottom: 14 }} disabled={loading} />
        {err && <ErrText>{err}</ErrText>}
        <button onClick={confirm} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </>}
    </>
  )
}

// ── Admin: company email → reset link sent ───────────────────────────────────
function AdminReset({ onBack }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const request = async () => {
    if (!email.trim()) { setErr('Enter your company email or admin username'); return }
    setErr(''); setLoading(true)
    try {
      const r = await api.adminResetRequest(email.trim())
      // We never reveal whether the account exists — but if the mail service
      // itself is down/misconfigured, say so rather than showing a false
      // "check your email".
      if (r?.serviceError) setErr("We couldn't send the email right now. Please contact support.")
      else setSent(true)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  if (sent) return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>📧</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Check your email</div>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
        If <b>{email}</b> matches a company account, we've sent a reset link to the company email on file. Open it to verify a code sent to your
        company phone, then set a new password. The link expires in 1 hour.
      </p>
    </div>
  )

  return (
    <>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: 16 }}>
        Enter the email on your company profile, or your admin username. We'll send a reset link to the company
        email on file. For security, you'll also confirm a code sent to your company phone.
      </p>
      <Label>Company email or admin username</Label>
      <input type="text" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="you@company.com" style={{ ...S.input, marginBottom: 14 }} disabled={loading} />
      {err && <ErrText>{err}</ErrText>}
      <button onClick={request} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
    </>
  )
}

function Done({ onBack }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Password updated</div>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 18 }}>
        You can now sign in with your new password.
      </p>
      <button onClick={onBack} style={{ ...S.btn('#1a56db'), width: '100%' }}>Back to sign in</button>
    </div>
  )
}

const Label = ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>{children}</div>
const ErrText = ({ children }) => <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12, lineHeight: 1.4 }}>{children}</div>
