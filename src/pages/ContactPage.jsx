import { useState } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'
import { useBreakpoints } from '../lib/useMediaQuery'

// Two different conversations share this page:
//   /contact                -> "Request access" (ready to onboard)
//   /contact?intent=pricing -> "Get a quote"    (still evaluating, wants a number)
// Same fields, different framing — asking what something costs is not the same
// as asking to be set up, and the reply they get back is different too.
const COPY = {
  access: {
    eyebrow: 'Request access',
    title: 'Get your fleet set up on SyncX Pro.',
    blurb: "Tell us about your company and we'll build your account, generate your logins, and get your drivers scanning.",
    points: [
      ['🏢', 'We create your company account — no self-serve signup, no strangers in your fleet'],
      ['🔑', 'You get an activation link and choose your own password'],
      ['🚛', 'Add drivers yourself, or hand out your Company ID and let them register'],
    ],
    button: 'Request access',
    sent: "We'll be in touch to set up your company account.",
    messageLabel: 'Anything we should know?',
    messagePlaceholder: 'When you want to start, how your paperwork flows today…',
  },
  pricing: {
    eyebrow: 'Get a quote',
    title: "Tell us your fleet size.\nWe'll send you a number.",
    blurb: 'SyncX Pro is priced per driver, quoted per fleet. No tiers, no feature paywalls — every fleet gets the whole product.',
    points: [
      ['💵', 'One per-driver rate, everything included'],
      ['📊', 'A real number for your fleet size, usually the same day'],
      ['🤝', 'No card, no commitment, no sales sequence'],
    ],
    button: 'Send me a quote',
    sent: "We'll come back with pricing for your fleet size.",
    messageLabel: 'Anything affecting the quote?',
    messagePlaceholder: 'Seasonal drivers, owner-operators, multiple divisions…',
  },
}

export default function ContactPage({ toast }) {
  const { isTablet } = useBreakpoints()
  const params = new URLSearchParams(window.location.search)
  const intent = params.get('intent') === 'pricing' ? 'pricing' : 'access'
  const c = COPY[intent]

  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', fleetSize: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.companyName.trim()) { toast('Company name is required', 'error'); return }
    if (!form.contactName.trim()) { toast('Your name is required', 'error'); return }
    if (!form.email.trim()) { toast('Email is required', 'error'); return }
    // Fleet size is what pricing is based on, so it's mandatory for a quote.
    if (intent === 'pricing' && !form.fleetSize) { toast('Fleet size is required to quote you', 'error'); return }
    setLoading(true)
    try {
      await api.submitSignupRequest({ ...form, intent })
      setSent(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const card = { background: 'white', borderRadius: 16, padding: isTablet ? 28 : 22 }

  if (sent) return (
    <Shell isTablet={isTablet}>
      <div style={{ ...card, textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Request received</div>
        <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 22 }}>
          {c.sent} We'll reach out to <b>{form.email}</b>.
        </div>
        <a href="/" style={{ ...S.btn('#1a56db'), display: 'block', textDecoration: 'none', textAlign: 'center' }}>Back to site</a>
      </div>
    </Shell>
  )

  return (
    <Shell isTablet={isTablet}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isTablet ? '0.85fr 1.15fr' : '1fr',
        gap: isTablet ? 48 : 28,
        alignItems: 'start',
      }}>
        {/* Left: what this particular request is */}
        <div style={{ paddingTop: isTablet ? 8 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: '#60a5fa', marginBottom: 14 }}>
            {c.eyebrow}
          </div>
          <h1 style={{ fontSize: isTablet ? 32 : 24, fontWeight: 800, color: 'white', letterSpacing: -0.8, lineHeight: 1.15, margin: '0 0 14px', whiteSpace: 'pre-line' }}>
            {c.title}
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: '0 0 24px' }}>
            {c.blurb}
          </p>
          {c.points.map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>{text}</span>
            </div>
          ))}
          <div style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            {intent === 'pricing'
              ? <>Ready to start instead? <a href="/contact" style={{ color: '#60a5fa', fontWeight: 700 }}>Request access</a></>
              : <>Want a price first? <a href="/contact?intent=pricing" style={{ color: '#60a5fa', fontWeight: 700 }}>Get a quote</a></>}
          </div>
        </div>

        {/* Right: the form — two columns of fields on desktop, stacked on phones */}
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr', gap: 14 }}>
            <FormField label="Company name *">
              <input autoComplete="organization" placeholder="Your company Inc." value={form.companyName}
                onChange={e => set('companyName', e.target.value)} disabled={loading} style={S.input} />
            </FormField>
            <FormField label="Your name *">
              <input autoComplete="name" placeholder="John Smith" value={form.contactName}
                onChange={e => set('contactName', e.target.value)} disabled={loading} style={S.input} />
            </FormField>
            <FormField label="Email *">
              <input type="email" autoComplete="email" placeholder="you@company.com" value={form.email}
                onChange={e => set('email', e.target.value)} disabled={loading} style={S.input} />
            </FormField>
            <FormField label="Phone">
              <input type="tel" autoComplete="tel" placeholder="+1 555 123 4567" value={form.phone}
                onChange={e => set('phone', e.target.value)} disabled={loading} style={S.input} />
            </FormField>
          </div>

          <div style={{ marginTop: 14 }}>
            <FormField
              label={intent === 'pricing' ? 'Fleet size *' : 'Fleet size'}
              hint={intent === 'pricing' ? 'This is what we price on.' : 'Helps us tailor your setup.'}>
              <select value={form.fleetSize} onChange={e => set('fleetSize', e.target.value)} disabled={loading} style={S.input}>
                <option value="">How many drivers?</option>
                <option value="1-10 drivers">1–10 drivers</option>
                <option value="11-25 drivers">11–25 drivers</option>
                <option value="26-50 drivers">26–50 drivers</option>
                <option value="51-100 drivers">51–100 drivers</option>
                <option value="100+ drivers">100+ drivers</option>
              </select>
            </FormField>
          </div>

          <div style={{ marginTop: 14 }}>
            <FormField label={c.messageLabel}>
              <textarea placeholder={c.messagePlaceholder} value={form.message}
                onChange={e => set('message', e.target.value)} disabled={loading} rows={3}
                style={{ ...S.input, resize: 'vertical' }} />
            </FormField>
          </div>

          <button onClick={submit} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%', marginTop: 20 }}>
            {loading ? 'Sending…' : c.button}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#9ca3af' }}>
            A real person reads this. No automated sales sequence.
          </div>
        </div>
      </div>
    </Shell>
  )
}

// Module scope on purpose — a component defined inside the page would get a new
// identity every keystroke and blur the input.
function Shell({ children, isTablet }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(150deg,#0f172a 0%,#1e3a5f 100%)', fontFamily: 'system-ui,sans-serif' }}>
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: isTablet ? '0 32px' : '0 20px', height: 62, display: 'flex', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: -0.4, textDecoration: 'none' }}>SyncX Pro</a>
          <a href="/login" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
        </div>
      </header>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isTablet ? '56px 32px 80px' : '32px 20px 60px' }}>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
