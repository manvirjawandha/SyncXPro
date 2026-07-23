import { useState, useEffect } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'
import { openAppSettings, checkAppPermissions } from '../lib/native'

// In-app settings for the driver (third bottom tab). Three sections:
//   • Profile — edit name & email (direct), change phone (OTP-verified)
//   • Permissions — show status + deep-link to the OS Settings app
//   • Sign out
export default function DriverSettings({ user, toast, onLogout, isTablet, onUserUpdate }) {
  const [profile, setProfile] = useState({ name: '', phone: '', email: '', username: '' })
  const [loading, setLoading] = useState(true)
  const [perms, setPerms] = useState(null)

  useEffect(() => {
    api.getDriverProfile()
      .then(p => setProfile(p))
      .catch(() => {
        // Backend route not reachable (e.g. not deployed yet, or offline).
        // Seed from the logged-in user so the form still shows their name
        // instead of blank, and editing degrades gracefully.
        setProfile({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '', username: user?.username || '' })
      })
      .finally(() => setLoading(false))
    checkAppPermissions().then(setPerms).catch(() => {})
  }, [])

  return (
    <div style={{ maxWidth: isTablet ? 640 : '100%', margin: '0 auto', paddingBottom: 24 }}>
      {isTablet && <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Settings</h1>}

      <ProfileSection profile={profile} setProfile={setProfile} loading={loading} toast={toast} onUserUpdate={onUserUpdate} />

      <PermissionsSection perms={perms} />

      <SupportSection user={user} profile={profile} />

      <AboutSection />

      <div style={{ ...S.card({ marginBottom: 14 }) }}>
        <button onClick={onLogout} style={{ width: '100%', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
        SyncX Pro · signed in as @{profile.username || user.username}
      </div>
    </div>
  )
}

// ── Support: two clearly-separated paths ─────────────────────────────────────
//   • App problem → emails SyncX Pro (us), with device/version pre-filled.
//   • Question about pay/documents → their own company office.
// Splitting these stops drivers emailing us about pay disputes we can't resolve.
const SUPPORT_EMAIL = 'support@syncxpro.com'
const APP_VERSION = '1.0.0'

function SupportSection({ user, profile }) {
  const emailSupport = () => {
    const subject = encodeURIComponent('SyncX Pro Driver — Support request')
    // Pre-fill who they are and what they're running, so we can diagnose fast
    // without a back-and-forth.
    const body = encodeURIComponent(
      `\n\n\n— — — — —\nPlease describe the problem above.\n\n` +
      `Driver: ${profile.name || user?.name || ''} (@${profile.username || user?.username || ''})\n` +
      `Company: ${user?.companyName || ''}\n` +
      `App version: ${APP_VERSION}\n` +
      `Device: ${navigator.userAgent}\n`
    )
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div style={S.card({ marginBottom: 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Help &amp; support</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>
        Pick the right one so your message reaches the people who can help.
      </div>

      {/* App problem → us */}
      <button onClick={emailSupport} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '13px 14px', cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>🛠️</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Something's not working</span>
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>App bugs, crashes, scanning issues — contact SyncX Pro</span>
        </span>
        <span style={{ color: '#cbd5e1', fontSize: 18 }}>›</span>
      </button>

      {/* Pay/doc question → their office */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '13px 14px' }}>
        <span style={{ fontSize: 20 }}>🏢</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Question about your pay or documents</span>
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>Contact your company office — they handle settlements and paperwork.</span>
        </span>
      </div>
    </div>
  )
}

// ── About ────────────────────────────────────────────────────────────────────
function AboutSection() {
  const openLink = (url) => { window.open(url, '_blank', 'noopener') }
  return (
    <div style={S.card({ marginBottom: 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>About</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>S</span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>SyncX Pro</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Driver app · v{APP_VERSION}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, margin: '0 0 14px' }}>
        Scan and submit your delivery documents — PODs, BOLs, lumper and fuel receipts —
        straight to your company office from your phone. Captures the location, turns
        pages into a PDF, and keeps working even when you're out of signal.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => openLink('https://syncxpro.com/privacy')} style={linkBtn}>Privacy Policy</button>
        <button onClick={() => openLink('https://syncxpro.com/terms')} style={linkBtn}>Terms</button>
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af' }}>© 2026 SyncX Pro. Made for drivers.</div>
    </div>
  )
}

const linkBtn = { flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }

// ── Profile: name + email (direct save), phone (OTP) ─────────────────────────
function ProfileSection({ profile, setProfile, loading, toast, onUserUpdate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [phoneModal, setPhoneModal] = useState(false)

  useEffect(() => { setName(profile.name || ''); setEmail(profile.email || '') }, [profile])

  const saveProfile = async () => {
    if (name.trim().length < 2) { toast('Enter your name', 'error'); return }
    setSaving(true)
    try {
      await api.updateDriverProfile({ name: name.trim(), email: email.trim() })
      setProfile(p => ({ ...p, name: name.trim(), email: email.trim() }))
      // Propagate the new name up so the document header ("Hi, <name>") and
      // everywhere else that reads user.name updates immediately.
      onUserUpdate?.({ name: name.trim(), email: email.trim() })
      toast('✓ Profile saved')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const maskPhone = (p) => {
    const d = String(p || '').replace(/\D/g, '')
    return d.length >= 4 ? '•••• ••' + d.slice(-4) : (p || 'Not set')
  }

  return (
    <div style={S.card({ marginBottom: 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Profile</div>

      <Label>Name</Label>
      <input value={name} onChange={e => setName(e.target.value)} disabled={loading || saving}
        placeholder="Your name" style={{ ...S.input, marginBottom: 14 }} />

      <Label>Email <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></Label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={loading || saving}
        placeholder="you@example.com" style={{ ...S.input, marginBottom: 14 }} />

      <button onClick={saveProfile} disabled={loading || saving} style={{ ...S.btn('#1a56db'), width: '100%', marginBottom: 16 }}>
        {saving ? 'Saving…' : 'Save profile'}
      </button>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
        <Label>Phone</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>{maskPhone(profile.phone)}</div>
          <button onClick={() => setPhoneModal(true)} style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Change
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          Changing your phone requires a verification code sent to the new number.
        </div>
      </div>

      {phoneModal && (
        <ChangePhoneModal toast={toast} onClose={() => setPhoneModal(false)}
          onDone={(newPhone) => { setProfile(p => ({ ...p, phone: newPhone })); setPhoneModal(false) }} />
      )}
    </div>
  )
}

// Phone change with OTP: enter number → code sent → verify → saved.
function ChangePhoneModal({ onClose, onDone, toast }) {
  const [step, setStep] = useState('enter') // enter | verify
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    if (!phone.trim()) { toast('Enter a phone number', 'error'); return }
    setBusy(true)
    try { await api.driverPhoneRequest(phone.trim()); setStep('verify'); toast('Code sent') }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  const confirm = async () => {
    if (!code.trim()) { toast('Enter the code', 'error'); return }
    setBusy(true)
    try {
      await api.driverPhoneConfirm({ phone: phone.trim(), code: code.trim() })
      toast('✓ Phone updated')
      onDone(phone.trim())
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 14 }}>Change phone number</div>

        {step === 'enter' ? (
          <>
            <Label>New phone number</Label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel"
              placeholder="+1 555 123 4567" style={{ ...S.input, marginBottom: 16 }} disabled={busy} autoFocus />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} disabled={busy} style={cancelBtn}>Cancel</button>
              <button onClick={sendCode} disabled={busy} style={{ ...S.btn('#1a56db'), flex: 1 }}>{busy ? 'Sending…' : 'Send code'}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
              Enter the 6-digit code we texted to <b>{phone}</b>.
            </div>
            <Label>Verification code</Label>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6}
              placeholder="123456" style={{ ...S.input, marginBottom: 16, letterSpacing: 3, fontFamily: 'monospace' }} disabled={busy} autoFocus />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('enter')} disabled={busy} style={cancelBtn}>Back</button>
              <button onClick={confirm} disabled={busy} style={{ ...S.btn('#1a56db'), flex: 1 }}>{busy ? 'Saving…' : 'Verify & save'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Permissions: status + deep-link to OS Settings ───────────────────────────
function PermissionsSection({ perms }) {
  const rows = [
    ['📷', 'Camera', 'Scan documents', perms?.camera],
    ['🖼️', 'Photos', 'Upload from gallery', perms?.photos],
    ['📍', 'Location', 'Stamp where docs are captured', perms?.location],
  ]
  const statusLabel = (s) => {
    if (s === 'granted') return { text: 'Allowed', color: '#166534', bg: '#dcfce7' }
    if (s === 'denied') return { text: 'Blocked', color: '#dc2626', bg: '#fee2e2' }
    if (s === 'prompt' || s === 'prompt-with-rationale') return { text: 'Ask', color: '#92400e', bg: '#fef3c7' }
    return { text: '—', color: '#6b7280', bg: '#f1f5f9' }
  }

  return (
    <div style={S.card({ marginBottom: 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Permissions</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>
        These are controlled by your device. Tap below to change them in Settings.
      </div>

      {rows.map(([icon, name, desc, status]) => {
        const st = statusLabel(status)
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.text}</span>
          </div>
        )
      })}

      <button onClick={openAppSettings} style={{ ...S.btn('#0f172a'), width: '100%', marginTop: 14 }}>
        Open device settings
      </button>
    </div>
  )
}

const Label = ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>{children}</div>
const cancelBtn = { flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
