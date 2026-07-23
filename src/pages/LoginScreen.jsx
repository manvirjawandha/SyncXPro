// src/pages/LoginScreen.jsx
import { useState } from 'react'
import { S } from '../lib/constants'
import { Field } from '../components/Shared'
import { api } from '../lib/api'
import ForgotPassword from './ForgotPassword'

function LogoWrap({ native, children }) {
  if (native) return <div>{children}</div>
  return <a href="/" style={{ textDecoration: 'none' }}>{children}</a>
}

// `native` = running inside the Capacitor driver app. The app has no website
// routes, so links to /contact and / are hidden rather than dead-ending the WebView.
export default function LoginScreen({ onLogin, native = false }) {
  const [tab, setTab] = useState('login') // login | signup
  const [fields, setFields] = useState({ username:'', password:'', confirmPassword:'', driverName:'', companyName:'', notifyEmails:'', companyId:'', phone:'', code:'' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [signupStep, setSignupStep] = useState('details') // details -> verify (OTP) -> (create)
  const [codeSent, setCodeSent] = useState(false)
  const [inactiveBlock, setInactiveBlock] = useState(false)

  const set = (k, v) => { setFields(p => ({...p, [k]: v})); setErrors(p => ({...p, [k]: ''})) }

  const handleLogin = async () => {
    const e = {}
    if (!fields.username.trim()) e.username = 'Username is required'
    if (!fields.password) e.password = 'Password is required'
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true)
    try {
      const data = await api.login(fields.username.trim(), fields.password)
      onLogin(data.user)
    } catch (err) {
      if (/ACCOUNT_INACTIVE/i.test(err.message)) setInactiveBlock(true)
      else setErrors({ password: err.message })
    }
    setLoading(false)
  }

  // Step 1: validate all details, then send an OTP to the driver's phone.
  const handleSignupDetails = async () => {
    const e = {}
    if (!fields.username.trim()) e.username = 'Username is required'
    else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(fields.username.trim())) e.username = '3-30 characters, letters/numbers/dots/dashes only'
    if (!fields.password) e.password = 'Password is required'
    else if (fields.password.length < 6) e.password = 'At least 6 characters'
    if (fields.password !== fields.confirmPassword) e.confirmPassword = 'Passwords do not match'
    if (!fields.driverName.trim()) e.driverName = 'Your name is required'
    if (!fields.companyId.trim()) e.companyId = 'Company ID is required'
    if (!fields.phone.trim()) e.phone = 'Phone number is required for verification'
    if (Object.keys(e).length) { setErrors(e); return }

    setLoading(true)
    try {
      await api.driverSendCode(fields.phone.trim())
      setCodeSent(true)
      setSignupStep('verify')
    } catch (err) {
      setErrors({ phone: err.message })
    }
    setLoading(false)
  }

  // Step 2: verify the OTP by creating the account (the code is checked server-side).
  const handleSignupVerify = async () => {
    if (!fields.code.trim()) { setErrors({ code: 'Enter the code from the SMS' }); return }
    setLoading(true)
    try {
      const payload = {
        username: fields.username.trim(),
        password: fields.password,
        role: 'driver',
        driverName: fields.driverName.trim(),
        companyId: fields.companyId.trim().toUpperCase(),
        phone: fields.phone.trim(),
        code: fields.code.trim(),
      }
      const data = await api.signup(payload)
      onLogin(data.user)
    } catch (err) {
      setErrors({ code: err.message })
    }
    setLoading(false)
  }

  const resendCode = async () => {
    setLoading(true)
    try { await api.driverSendCode(fields.phone.trim()); setErrors({}) }
    catch (err) { setErrors({ code: err.message }) }
    setLoading(false)
  }

  if (inactiveBlock) {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0f172a 0%,#1e3a5f 55%,#0f172a 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'system-ui,sans-serif' }}>
        <div style={{ width:'100%', maxWidth:400, background:'white', borderRadius:16, padding:'32px 24px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
          <div style={{ fontSize:19, fontWeight:800, color:'#0f172a', marginBottom:10 }}>Account Inactive</div>
          <p style={{ fontSize:14, color:'#4b5563', lineHeight:1.6, marginBottom:20 }}>
            Your account has been marked Inactive. Please contact support.
          </p>
          <a href="/contact" style={{ ...S.btn('#1a56db'), display:'block', textDecoration:'none', textAlign:'center', marginBottom:10 }}>Contact support</a>
          <button onClick={() => { setInactiveBlock(false); setFields(p => ({ ...p, password:'' })) }} style={{ background:'none', border:'none', color:'#6b7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>← Back to sign in</button>
        </div>
      </div>
    )
  }

  return (
    <>
    {tab === 'forgot' ? <ForgotPassword native={native} onBack={() => setTab('login')} /> : (
    <div style={{ minHeight:'100vh', height:'100%', overflowY:'auto', WebkitOverflowScrolling:'touch', background:'linear-gradient(160deg,#0f172a 0%,#1e3a5f 55%,#0f172a 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 40px)' }}>
      {/* Logo */}
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <LogoWrap native={native}>
          <div style={{ fontSize:52, marginBottom:10 }}>📋</div>
          <div style={{ fontSize:28, fontWeight:800, color:'white', letterSpacing:-0.5 }}>SyncX Pro</div>
        </LogoWrap>
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)', marginTop:4 }}>Fleet Document Management</div>
      </div>

      <div style={{ ...S.card(), width:'100%', maxWidth:400 }}>
        {/* Tabs */}
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:12, padding:4, marginBottom:24 }}>
          {[['login','Sign In'],['signup','Create Account']].map(([id,label]) => (
            <button key={id} onClick={() => { setTab(id); setErrors({}) }} style={{
              flex:1, padding:'10px', borderRadius:10, border:'none', cursor:'pointer', fontSize:14, fontWeight:700,
              background: tab===id ? 'white' : 'transparent',
              color: tab===id ? '#111827' : '#9ca3af',
              boxShadow: tab===id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition:'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* LOGIN */}
        {tab === 'login' && (
          <>
            <Field label="Username" error={errors.username}>
              <input style={S.input} value={fields.username} onChange={e => set('username', e.target.value)}
                placeholder="your-username" autoCapitalize="none" autoComplete="username"
                onKeyDown={e => e.key==='Enter' && handleLogin()} />
            </Field>
            <Field label="Password" error={errors.password}>
              <input type="password" style={S.input} value={fields.password} onChange={e => set('password', e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                onKeyDown={e => e.key==='Enter' && handleLogin()} />
            </Field>
            <button onClick={handleLogin} disabled={loading} style={{ ...S.btn('#1a56db'), width:'100%', opacity:loading?.7:1 }}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
            <div style={{ textAlign:'center', marginTop:12 }}>
              <button onClick={() => setTab('forgot')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontWeight:600, fontSize:13, textDecoration:'underline' }}>
                Forgot password?
              </button>
            </div>
            <div style={{ textAlign:'center', fontSize:13, color:'#9ca3af', marginTop:16 }}>
              No account?{' '}
              <button onClick={() => setTab('signup')} style={{ background:'none', border:'none', color:'#1a56db', cursor:'pointer', fontWeight:700, fontSize:13 }}>
                Create one
              </button>
            </div>
            {!native && (
              <div style={{ textAlign:'center', fontSize:13, color:'#9ca3af', marginTop:8 }}>
                Are you a company?{' '}
                <a href="/contact" style={{ color:'#1a56db', fontWeight:700, fontSize:13, textDecoration:'none' }}>
                  Request an account
                </a>
              </div>
            )}
          </>
        )}

        {/* SIGN UP */}
        {tab === 'signup' && signupStep === 'details' && (
          <>
            <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:'12px 14px', marginBottom:20 }}>
              <div style={{ fontSize:13, color:'#1e40af', lineHeight:1.5 }}>
                <b>Driver sign-up.</b> {native
                  ? 'Register below using the Company ID from your fleet admin.'
                  : <>Company accounts are set up by SyncX Pro — <a href="/contact" style={{ color:'#1e40af', fontWeight:700 }}>contact us</a> to onboard your company. Drivers register below using the Company ID from their admin.</>}
              </div>
            </div>

            <Field label="Username" error={errors.username} hint="Letters, numbers, dots, dashes — no spaces">
              <input style={S.input} value={fields.username} onChange={e => set('username', e.target.value.toLowerCase())}
                placeholder="john.smith" autoCapitalize="none" autoComplete="username" />
            </Field>
            <Field label="Password" error={errors.password}>
              <input type="password" style={S.input} value={fields.password} onChange={e => set('password', e.target.value)}
                placeholder="Min. 6 characters" autoComplete="new-password" />
            </Field>
            <Field label="Confirm Password" error={errors.confirmPassword}>
              <input type="password" style={S.input} value={fields.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                placeholder="Repeat password" autoComplete="new-password" />
            </Field>

            <Field label="Your Full Name" error={errors.driverName}>
              <input style={S.input} value={fields.driverName} onChange={e => set('driverName', e.target.value)}
                placeholder="e.g. John Smith" autoComplete="name" />
            </Field>
            <Field label="Company ID" error={errors.companyId} hint="Get this from your fleet admin">
              <input style={{ ...S.input, fontFamily:'monospace', letterSpacing:3, fontSize:17, textTransform:'uppercase' }}
                value={fields.companyId} onChange={e => set('companyId', e.target.value.toUpperCase())}
                placeholder="COXXXXXX" maxLength={8} />
            </Field>
            <Field label="Mobile Phone" error={errors.phone} hint="We'll text you a code to verify it's you">
              <input type="tel" style={S.input} value={fields.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+1 555 123 4567" autoComplete="tel" />
            </Field>

            <button onClick={handleSignupDetails} disabled={loading} style={{ ...S.btn('#1a56db'), width:'100%', opacity:loading?.7:1, marginTop:4 }}>
              {loading ? 'Sending code…' : 'Continue →'}
            </button>
            <div style={{ textAlign:'center', fontSize:13, color:'#9ca3af', marginTop:16 }}>
              Already have an account?{' '}
              <button onClick={() => setTab('login')} style={{ background:'none', border:'none', color:'#1a56db', cursor:'pointer', fontWeight:700, fontSize:13 }}>
                Sign in
              </button>
            </div>
          </>
        )}

        {/* SIGN UP — phone verification step */}
        {tab === 'signup' && signupStep === 'verify' && (
          <>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginBottom:4 }}>Verify your phone</div>
              <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.5 }}>
                We sent a 6-digit code to <b>{fields.phone}</b>. Enter it below to finish creating your account.
              </div>
            </div>

            <Field label="Verification Code" error={errors.code}>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                style={{ ...S.input, fontSize:24, letterSpacing:8, textAlign:'center', fontFamily:'monospace' }}
                value={fields.code} onChange={e => set('code', e.target.value.replace(/\D/g, ''))}
                placeholder="123456" />
            </Field>

            <button onClick={handleSignupVerify} disabled={loading} style={{ ...S.btn('#0e9f6e'), width:'100%', opacity:loading?.7:1 }}>
              {loading ? 'Verifying…' : 'Verify & Create Account'}
            </button>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16 }}>
              <button onClick={() => { setSignupStep('details'); set('code',''); }} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                ← Edit details
              </button>
              <button onClick={resendCode} disabled={loading} style={{ background:'none', border:'none', color:'#1a56db', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                Resend code
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    )}
    </>
  )
}
