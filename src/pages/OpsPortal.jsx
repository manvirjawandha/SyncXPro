import { useState, useEffect } from 'react'
import { S } from '../lib/constants'
import { api } from '../lib/api'

// The operator portal lives at /ops. It's gated by BOTH a secret access key
// (checked server-side) and operator login. Built desktop-first — this is an
// internal back-office tool used on a computer.
const opsCss = `
  .ops-row { transition: background 120ms ease; }
  .ops-row:hover { background: #f8fafc; }
  .ops-navlink:hover { color: #ffffff !important; }
  .ops-th { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;
            letter-spacing: 0.6px; text-align: left; padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
  .ops-td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px;
            color: #111827; vertical-align: top; }
  .ops-btn { border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px;
             font-weight: 700; cursor: pointer; white-space: nowrap; }
`

const CONTENT_MAX = 1120

export default function OpsPortal({ toast }) {
  const [authed, setAuthed] = useState(api.opsIsAuthed())

  if (!authed) return <OpsLogin onLogin={() => setAuthed(true)} toast={toast} />
  return <OpsDashboard onLogout={() => { api.opsLogout(); setAuthed(false) }} toast={toast} />
}

function OpsLogin({ onLogin, toast }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secretPath, setSecretPath] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!username || !password) { toast('Enter username and password', 'error'); return }
    setLoading(true)
    try {
      await api.opsLogin(username, password, secretPath)
      onLogin()
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>SyncX Pro</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>Operations Portal</div>
        </div>
        <div style={{ background: 'white', borderRadius: 16, padding: 24 }}>
          <form autoComplete="off" onSubmit={e => { e.preventDefault(); handleLogin() }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Access key</div>
            <input type="password" name="syncx-ops-key" autoComplete="off" placeholder="Secret access key" value={secretPath} onChange={e => setSecretPath(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 14 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Operator username</div>
            <input type="text" name="syncx-ops-user" autoComplete="off" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 14 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Password</div>
            <input type="password" name="syncx-ops-pw" autoComplete="new-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 20 }} />
            <button type="submit" disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>← Back to app</a>
        </div>
      </div>
    </div>
  )
}

function OpsDashboard({ onLogout, toast }) {
  const [view, setView] = useState('requests') // 'requests' | 'companies' | 'create' | 'detail'
  const [companies, setCompanies] = useState([])
  const [requests, setRequests] = useState([])
  const [prefill, setPrefill] = useState(null)
  const [detailId, setDetailId] = useState(null) // company being viewed
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([api.opsGetCompanies(), api.opsGetRequests()])
      setCompanies(c.companies || [])
      setRequests(r.requests || [])
    }
    catch (e) {
      toast(e.message, 'error')
      if (String(e.message).includes('authenticated') || String(e.message).includes('expired')) onLogout()
    }
    setLoading(false)
  }

  const newRequestCount = requests.filter(r => r.status === 'new').length
  const pendingCount = companies.filter(c => c.status === 'pending').length

  const navBtn = (active) => ({
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 16px',
    fontSize: 14, fontWeight: 600, color: active ? 'white' : 'rgba(255,255,255,0.5)',
    borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui,sans-serif' }}>
      <style>{opsCss}</style>

      <header style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'white', letterSpacing: -0.3 }}>SyncX Pro</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>Ops</span>
          </div>

          <nav style={{ display: 'flex', gap: 4, alignSelf: 'stretch', flex: 1 }}>
            <button onClick={() => { setPrefill(null); setView('requests') }} className="ops-navlink" style={navBtn(view === 'requests')}>
              Requests{newRequestCount > 0 ? ` (${newRequestCount})` : ''}
            </button>
            <button onClick={() => { setPrefill(null); setView('companies') }} className="ops-navlink" style={navBtn(view === 'companies')}>
              Companies ({companies.length})
            </button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button onClick={() => { setPrefill(null); setView('create') }} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '8px 14px', fontSize: 13 }}>+ New company</button>
            <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Sign out</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '28px 32px 60px' }}>
        {view === 'create' ? (
          <CreateCompany
            prefill={prefill}
            onDone={() => { setView('companies'); setPrefill(null); load() }}
            onCancel={() => { setView(prefill ? 'requests' : 'companies'); setPrefill(null) }}
            toast={toast}
          />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading…</div>
        ) : view === 'requests' ? (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Signup requests</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>Companies who submitted the contact form. Create an account to send them an activation link.</p>
            <RequestsTable requests={requests} onChange={load} toast={toast}
              onCreate={r => { setPrefill(r); setView('create') }} />
          </>
        ) : view === 'detail' ? (
          <CompanyDetail companyId={detailId} toast={toast}
            onBack={() => { setView('companies'); setDetailId(null); load() }}
            onChanged={load} />
        ) : (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Companies</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
              {companies.length} total{pendingCount > 0 ? ` · ${pendingCount} awaiting activation` : ''}
            </p>
            <CompaniesTable companies={companies} onChange={load} toast={toast}
              onOpen={(id) => { setDetailId(id); setView('detail') }} />
          </>
        )}
      </main>
    </div>
  )
}

function TableShell({ children, empty }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {empty || <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>{children}</table></div>}
    </div>
  )
}

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{body}</div>
    </div>
  )
}

function RequestsTable({ requests, onChange, onCreate, toast }) {
  const [busy, setBusy] = useState(null)

  const dismiss = async (r) => {
    if (!confirm(`Dismiss the request from ${r.companyName}?`)) return
    setBusy(r.id)
    try { await api.opsDeleteRequest(r.id); toast('Request dismissed'); onChange() }
    catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  if (requests.length === 0) return (
    <TableShell empty={<EmptyState icon="📥" title="No signup requests" body="Requests from the contact form appear here." />} />
  )

  return (
    <TableShell>
      <thead>
        <tr>
          <th className="ops-th">Company</th>
          <th className="ops-th">Contact</th>
          <th className="ops-th">Received</th>
          <th className="ops-th">Status</th>
          <th className="ops-th" style={{ width: 220 }}></th>
        </tr>
      </thead>
      <tbody>
        {requests.map(r => {
          const isConverted = r.status === 'converted'
          return (
            <tr key={r.id} className="ops-row" style={{ opacity: isConverted ? 0.6 : 1 }}>
              <td className="ops-td">
                <div style={{ fontWeight: 700 }}>{r.companyName}</div>
                {r.message && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, maxWidth: 380, lineHeight: 1.5 }}>{r.message}</div>
                )}
              </td>
              <td className="ops-td">
                <div>{r.contactName}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.email}</div>
                {r.phone && <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{r.phone}</div>}
                {r.fleetSize && (
                  <div style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#1a56db' }}>
                    🚛 {r.fleetSize}
                  </div>
                )}
              </td>
              <td className="ops-td" style={{ color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td className="ops-td">
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: isConverted ? '#dcfce7' : '#eff6ff', color: isConverted ? '#166534' : '#1a56db' }}>
                  {isConverted ? 'Converted' : 'New'}
                </span>
              </td>
              <td className="ops-td" style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {!isConverted && (
                    <button onClick={() => onCreate(r)} disabled={busy === r.id} className="ops-btn" style={{ background: '#0e9f6e', color: 'white' }}>
                      Create company
                    </button>
                  )}
                  <button onClick={() => dismiss(r)} disabled={busy === r.id} className="ops-btn" style={{ background: '#f1f5f9', color: '#64748b' }}>
                    Dismiss
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </TableShell>
  )
}

function CompaniesTable({ companies, onChange, toast, onOpen }) {
  const [busy, setBusy] = useState(null)

  const resend = async (c) => {
    setBusy(c.id)
    try {
      const r = await api.opsResendActivation(c.id)
      if (r.emailSent) toast('✓ Activation link re-sent', 'success')
      else { toast('Email failed — link copied to clipboard', 'error'); navigator.clipboard?.writeText(r.activationLink) }
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  const del = async (c) => {
    if (!confirm(`Delete ${c.name}? This removes the company and its admin login.`)) return
    setBusy(c.id)
    try { await api.opsDeleteCompany(c.id); toast('Company deleted'); onChange() }
    catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  if (companies.length === 0) return (
    <TableShell empty={<EmptyState icon="🏢" title="No companies yet" body="Create one from a signup request to get started." />} />
  )

  return (
    <TableShell>
      <thead>
        <tr>
          <th className="ops-th">Company</th>
          <th className="ops-th">Company ID</th>
          <th className="ops-th">Admin username</th>
          <th className="ops-th">Contact</th>
          <th className="ops-th">Drivers</th>
          <th className="ops-th">Status</th>
          <th className="ops-th" style={{ width: 200 }}></th>
        </tr>
      </thead>
      <tbody>
        {companies.map(c => {
          const isPending = c.status === 'pending'
          const isInactive = c.status === 'inactive'
          const pill = isPending ? { bg:'#fef3c7', fg:'#92400e', label:'Pending activation' }
            : isInactive ? { bg:'#fee2e2', fg:'#dc2626', label:'Inactive' }
            : { bg:'#dcfce7', fg:'#166534', label:'Active' }
          return (
            <tr key={c.id} className="ops-row">
              <td className="ops-td" style={{ fontWeight: 700 }}>
                <button onClick={() => onOpen?.(c.id)} style={{ background:'none', border:'none', padding:0, fontWeight:700, fontSize:'inherit', color:'#1a56db', cursor:'pointer', textAlign:'left', textDecoration:'underline' }}>
                  {c.name}
                </button>
              </td>
              <td className="ops-td" style={{ fontFamily: 'monospace', fontSize: 13, color: '#1a56db', fontWeight: 700 }}>{c.id}</td>
              <td className="ops-td" style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563' }}>{c.adminUsername || '—'}</td>
              <td className="ops-td">
                <div style={{ fontSize: 13 }}>{c.contactEmail || '—'}</div>
                {c.contactPhone && <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>{c.contactPhone}</div>}
              </td>
              <td className="ops-td" style={{ color: '#6b7280' }}>{c.driverCount}</td>
              <td className="ops-td">
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: pill.bg, color: pill.fg, whiteSpace: 'nowrap' }}>
                  {pill.label}
                </span>
              </td>
              <td className="ops-td" style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {isPending && (
                    <button onClick={() => resend(c)} disabled={busy === c.id} className="ops-btn" style={{ background: '#eff6ff', color: '#1a56db' }}>
                      Resend link
                    </button>
                  )}
                  <button onClick={() => del(c)} disabled={busy === c.id} className="ops-btn" style={{ background: '#fee2e2', color: '#dc2626' }}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </TableShell>
  )
}

function CreateCompany({ onDone, onCancel, toast, prefill }) {
  const [form, setForm] = useState({
    companyName: prefill?.companyName || '',
    contactName: prefill?.contactName || '',
    contactEmail: prefill?.email || '',
    contactPhone: prefill?.phone || '',
    notifyEmails: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.companyName.trim()) { toast('Company name is required', 'error'); return }
    if (!form.contactEmail.trim()) { toast('Contact email is required', 'error'); return }
    setLoading(true)
    try {
      const r = await api.opsCreateCompany(form)
      if (prefill?.id) { try { await api.opsConvertRequest(prefill.id) } catch {} }
      setResult(r)
      if (r.emailSent) toast('✓ Company created & activation email sent', 'success')
      else toast('Company created — email failed, copy the link below', 'error')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  if (result) return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ ...S.card(), marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#166534', marginBottom: 4 }}>✓ Company created</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          {result.emailSent
            ? `An activation email was sent to ${result.company.contactEmail}.`
            : 'The activation email could not be sent — share the link below with the client manually.'}
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 2 }}>
          <div>Company: <b>{result.company.name}</b></div>
          <div>Company ID: <b style={{ fontFamily: 'monospace' }}>{result.company.id}</b></div>
          <div>Admin username: <b style={{ fontFamily: 'monospace' }}>{result.company.adminUsername}</b></div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '16px 0 5px' }}>Activation link</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={result.activationLink} style={{ ...S.input, fontSize: 12, fontFamily: 'monospace' }} onFocus={e => e.target.select()} />
          <button onClick={() => { navigator.clipboard?.writeText(result.activationLink); toast('Copied') }} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '0 16px' }}>Copy</button>
        </div>
      </div>
      <button onClick={onDone} style={{ ...S.btn('#0e9f6e'), maxWidth: 200 }}>Done</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 620 }}>
      <button onClick={onCancel} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>← Back</button>
      <div style={S.card()}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>New company</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>Enter the details from the client's signup request. SyncX Pro generates their username and Company ID, then emails an activation link.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Company name *</div>
            <input autoComplete="off" placeholder="Hunter Express" value={form.companyName} onChange={e => set('companyName', e.target.value)} disabled={loading} style={{ ...S.input }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Contact name</div>
            <input autoComplete="off" placeholder="John Smith" value={form.contactName} onChange={e => set('contactName', e.target.value)} disabled={loading} style={{ ...S.input }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Contact email *</div>
            <input type="email" autoComplete="off" placeholder="admin@company.com" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} disabled={loading} style={{ ...S.input }} />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Activation link is sent here.</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Contact phone</div>
            <input type="tel" autoComplete="off" placeholder="+1 555 123 4567" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} disabled={loading} style={{ ...S.input }} />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Used for SMS verification.</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '14px 0 5px' }}>Notification emails</div>
        <input autoComplete="off" placeholder="Leave blank to use the contact email" value={form.notifyEmails} onChange={e => set('notifyEmails', e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 20 }} />

        <button onClick={submit} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>{loading ? 'Creating…' : 'Create & send activation'}</button>
      </div>
    </div>
  )
}

// ── Company detail: edit info, toggle status, manage drivers ─────────────────
function CompanyDetail({ companyId, onBack, onChanged, toast }) {
  const [company, setCompany] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [resetDriver, setResetDriver] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.opsGetCompany(companyId)
      setCompany(d.company); setDrivers(d.drivers || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])

  const toggleStatus = async () => {
    const next = company.status === 'inactive' ? 'active' : 'inactive'
    const verb = next === 'inactive' ? 'mark INACTIVE (blocks all their logins)' : 'reactivate'
    if (!confirm(`Are you sure you want to ${verb} ${company.name}?`)) return
    try {
      await api.opsSetCompanyStatus(companyId, next)
      toast(next === 'inactive' ? 'Company marked inactive' : 'Company reactivated')
      load(); onChanged?.()
    } catch (e) { toast(e.message, 'error') }
  }

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Loading…</div>
  if (!company) return <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Company not found.</div>

  const isInactive = company.status === 'inactive'
  const isPending = company.status === 'pending'

  return (
    <div>
      <button onClick={onBack} style={{ background:'none', border:'none', color:'#1a56db', cursor:'pointer', fontSize:14, fontWeight:700, padding:0, marginBottom:16 }}>← Back to companies</button>

      {/* Company header + status */}
      <div style={{ ...S.card(), marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
              <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0 }}>{company.name}</h1>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: isPending?'#fef3c7':isInactive?'#fee2e2':'#dcfce7', color: isPending?'#92400e':isInactive?'#dc2626':'#166534' }}>
                {isPending ? 'Pending activation' : isInactive ? 'Inactive' : 'Active'}
              </span>
            </div>
            <div style={{ fontSize:13, color:'#6b7280', fontFamily:'monospace' }}>ID: {company.id} · admin @{company.adminUsername || '—'}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setEditing(true)} style={{ background:'#eff6ff', color:'#1a56db', border:'none', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }}>Edit info</button>
            {!isPending && (
              <button onClick={toggleStatus} style={{ background: isInactive?'#dcfce7':'#fef3c7', color: isInactive?'#166534':'#92400e', border:'none', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {isInactive ? 'Reactivate' : 'Mark inactive'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginTop:18, paddingTop:18, borderTop:'1px solid #f1f5f9' }}>
          <Detail label="Contact email" value={company.contactEmail || '—'} />
          <Detail label="Contact phone" value={company.contactPhone || '—'} />
          <Detail label="Drivers" value={String(drivers.length)} />
          <Detail label="Currency" value={company.currency || 'USD'} />
        </div>
      </div>

      {editing && (
        <EditCompanyModal company={company} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); onChanged?.() }} toast={toast} />
      )}

      {/* Drivers */}
      <div style={{ ...S.card() }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginBottom:14 }}>Drivers ({drivers.length})</div>
        {drivers.length === 0 ? (
          <div style={{ color:'#9ca3af', fontSize:14, padding:'20px 0', textAlign:'center' }}>No drivers yet.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th className="ops-th">Name</th><th className="ops-th">Username</th>
              <th className="ops-th">Email</th><th className="ops-th">Phone</th>
              <th className="ops-th" style={{ width:120 }}></th>
            </tr></thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.username} className="ops-row">
                  <td className="ops-td" style={{ fontWeight:700 }}>{d.name}</td>
                  <td className="ops-td" style={{ fontFamily:'monospace', fontSize:13, color:'#4b5563' }}>@{d.username}</td>
                  <td className="ops-td" style={{ fontSize:13 }}>{d.email || '—'}</td>
                  <td className="ops-td" style={{ fontSize:13, fontFamily:'monospace' }}>{d.phone || '—'}</td>
                  <td className="ops-td" style={{ textAlign:'right' }}>
                    <button onClick={() => setResetDriver(d)} style={{ background:'#eff6ff', color:'#1a56db', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resetDriver && (
        <ManageDriverModal driver={resetDriver} onClose={() => setResetDriver(null)}
          onSaved={() => { setResetDriver(null); load() }} toast={toast} />
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:14, color:'#0f172a', fontWeight:600 }}>{value}</div>
    </div>
  )
}

function EditCompanyModal({ company, onClose, onSaved, toast }) {
  const [name, setName] = useState(company.name || '')
  const [email, setEmail] = useState(company.contactEmail || '')
  const [phone, setPhone] = useState(company.contactPhone || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast('Company name required', 'error'); return }
    setBusy(true)
    try {
      await api.opsUpdateCompany(company.id, { name: name.trim(), contactEmail: email.trim(), contactPhone: phone.trim() })
      toast('✓ Company updated'); onSaved()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  return (
    <ModalShell title="Edit company" onClose={onClose}>
      <L>Company name</L>
      <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom:12 }} disabled={busy} />
      <L>Contact email</L>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...S.input, marginBottom:12 }} disabled={busy} />
      <L>Contact phone</L>
      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={{ ...S.input, marginBottom:18 }} disabled={busy} />
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onClose} disabled={busy} style={cancelBtnOps}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...S.btn('#1a56db'), flex:1 }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </ModalShell>
  )
}

// Manage a driver: reset password directly, edit email/phone, or email a
// self-service reset link (driver then verifies via OTP to their phone).
function ManageDriverModal({ driver, onClose, onSaved, toast }) {
  const [tab, setTab] = useState('edit') // edit | password
  const [name, setName] = useState(driver.name || '')
  const [email, setEmail] = useState(driver.email || '')
  const [phone, setPhone] = useState(driver.phone || '')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const saveInfo = async () => {
    setBusy(true)
    try { await api.opsUpdateDriver(driver.username, { name: name.trim(), email: email.trim(), phone: phone.trim() }); toast('✓ Driver updated'); onSaved() }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }
  const setPassword = async () => {
    if (pw.length < 6) { toast('Password: at least 6 characters', 'error'); return }
    setBusy(true)
    try { await api.opsResetDriverPassword(driver.username, pw); toast(`✓ Password set for ${driver.name}`); onSaved() }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }
  const sendLink = async () => {
    setBusy(true)
    try { await api.opsSendDriverReset(driver.username); toast(`✓ Reset link sent to ${driver.email}`) }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  return (
    <ModalShell title={`Manage ${driver.name}`} onClose={onClose}>
      <div style={{ display:'flex', gap:6, background:'#f1f5f9', borderRadius:10, padding:4, marginBottom:16 }}>
        {[['edit','Edit info'],['password','Password']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background: tab===id?'white':'transparent', color: tab===id?'#1a56db':'#6b7280' }}>{label}</button>
        ))}
      </div>

      {tab === 'edit' ? (
        <>
          <L>Name</L>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom:12 }} disabled={busy} />
          <L>Email</L>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com" style={{ ...S.input, marginBottom:12 }} disabled={busy} />
          <L>Phone</L>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 123 4567" style={{ ...S.input, marginBottom:18 }} disabled={busy} />
          <button onClick={saveInfo} disabled={busy} style={{ ...S.btn('#1a56db'), width:'100%' }}>{busy ? 'Saving…' : 'Save info'}</button>
        </>
      ) : (
        <>
          <L>Set a new password directly</L>
          <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters" style={{ ...S.input, marginBottom:12 }} disabled={busy} />
          <button onClick={setPassword} disabled={busy} style={{ ...S.btn('#1a56db'), width:'100%', marginBottom:18 }}>{busy ? 'Setting…' : 'Set password'}</button>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16 }}>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:10, lineHeight:1.5 }}>
              Or email the driver a reset link. They'll verify a code sent to their phone, then choose their own password.
              {!driver.email && <span style={{ color:'#dc2626', display:'block', marginTop:4 }}>No email on file — add one in "Edit info" first.</span>}
            </div>
            <button onClick={sendLink} disabled={busy || !driver.email} style={{ ...S.btn('#0e9f6e'), width:'100%', opacity: driver.email?1:0.5 }}>{busy ? 'Sending…' : 'Email reset link'}</button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:60 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:400, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ fontSize:17, fontWeight:800, color:'#111827', marginBottom:16 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const L = ({ children }) => <div style={{ fontSize:12, fontWeight:700, color:'#6b7280', marginBottom:5 }}>{children}</div>
const cancelBtnOps = { flex:1, background:'#f1f5f9', color:'#374151', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:700, cursor:'pointer' }
