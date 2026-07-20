import { useState, useEffect } from 'react'
import { S, DOC_TYPES, CURRENCIES } from '../lib/constants'
import { api } from '../lib/api'

// section: 'drivers' -> driver management only
// section: 'company' -> company settings only
// wide: true when rendered inside the desktop website layout
export default function CompanySettingsPage({ user, toast, section = 'drivers', wide = false }) {
  const [msg, setMsg] = useState(null)
  const notify = (m, type = 'success') => {
    if (toast) toast(m, type)
    else { setMsg({ m, type }); setTimeout(() => setMsg(null), 3500) }
  }

  return (
    <div style={{ maxWidth: wide ? 'none' : 560, margin: '0 auto' }}>
      {msg && (
        <div style={{ background: msg.type === 'error' ? '#fee2e2' : '#dcfce7', color: msg.type === 'error' ? '#991b1b' : '#166534', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {msg.m}
        </div>
      )}
      {section === 'drivers'
        ? <DriversSection user={user} notify={notify} wide={wide} />
        : <CompanySection user={user} notify={notify} wide={wide} />}
    </div>
  )
}

// ── Drivers section ──────────────────────────────────────────────────────────
function DriversSection({ user, notify, wide = false }) {
  const [view, setView] = useState('list') // 'list' | 'create'
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(false)
  const [newDriver, setNewDriver] = useState({ name: '', username: '', password: '' })

  useEffect(() => { loadDrivers() }, [])

  const loadDrivers = async () => {
    try { const result = await api.getDriversList(); setDrivers(result.drivers || []) }
    catch (e) { console.error('Failed to load drivers:', e) }
  }

  const handleCreateDriver = async () => {
    if (!newDriver.name.trim() || !newDriver.username.trim()) { notify('Name and username are required', 'error'); return }
    if (!newDriver.password || newDriver.password.length < 6) { notify('Password must be at least 6 characters', 'error'); return }
    setLoading(true)
    try {
      await api.createDriver(newDriver.username.toLowerCase(), newDriver.password, newDriver.name)
      notify(`✓ Driver "${newDriver.name}" created`)
      setNewDriver({ name: '', username: '', password: '' })
      await loadDrivers()
      setView('list')
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  const [resetDriver, setResetDriver] = useState(null) // driver row we're resetting

  const handleDeleteDriver = async (username) => {
    if (!confirm(`Delete driver @${username}? This cannot be undone.`)) return
    setLoading(true)
    try { await api.deleteDriver(username); notify('✓ Driver deleted'); loadDrivers() }
    catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  // ── CREATE VIEW (separate page) ──
  if (view === 'create') return (
    <div style={{ maxWidth: wide ? 560 : 'none' }}>
      <button onClick={() => { setView('list'); setNewDriver({ name: '', username: '', password: '' }) }}
        style={{ background: 'white', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
        ← Back to drivers
      </button>
      <div style={S.card()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>New driver credentials</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>The driver will use this username and password to sign in.</div>

        {/* autoComplete off + unusual field names prevent the browser from autofilling saved logins */}
        <form autoComplete="off" onSubmit={e => { e.preventDefault(); handleCreateDriver() }}>
          <input type="text" name="dscp-drv-fullname" autoComplete="off"
            placeholder="Driver full name (e.g. John Smith)" value={newDriver.name}
            onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} disabled={loading}
            style={{ ...S.input, marginBottom: 10 }} />
          <input type="text" name="dscp-drv-uname" autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder="Username (e.g. jsmith)" value={newDriver.username}
            onChange={e => setNewDriver({ ...newDriver, username: e.target.value })} disabled={loading}
            style={{ ...S.input, marginBottom: 10, fontFamily: 'monospace' }} />
          <input type="password" name="dscp-drv-pw" autoComplete="new-password"
            placeholder="Password (min 6 characters)" value={newDriver.password}
            onChange={e => setNewDriver({ ...newDriver, password: e.target.value })} disabled={loading}
            style={{ ...S.input, marginBottom: 16 }} />
          <button type="submit" disabled={loading} style={{ ...S.btn('#0e9f6e'), width: '100%' }}>
            {loading ? '⏳ Creating…' : '✓ Create driver'}
          </button>
        </form>
      </div>
    </div>
  )

  // ── LIST VIEW — desktop table ──
  if (wide) return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          {drivers.length} driver{drivers.length !== 1 ? 's' : ''} · share Company ID{' '}
          <b style={{ fontFamily: 'monospace', color: '#1a56db' }}>{user?.companyId}</b> for drivers to self-register
        </div>
        <button onClick={() => setView('create')} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '10px 16px' }}>
          + Create driver
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {drivers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚛</div>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>No drivers yet</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Create one above, or share your Company ID so drivers can register themselves.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="sx-th">Name</th>
                <th className="sx-th">Username</th>
                <th className="sx-th">Documents</th>
                <th className="sx-th">Pay cycle</th>
                <th className="sx-th" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.username}>
                  <td className="sx-td" style={{ fontWeight: 700 }}>{d.name}</td>
                  <td className="sx-td" style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563' }}>@{d.username}</td>
                  <td className="sx-td" style={{ color: '#6b7280' }}>{typeof d.docCount === 'number' ? d.docCount : '—'}</td>
                  <td className="sx-td">
                    <PayCycleSelect driver={d} onSaved={loadDrivers} notify={notify} />
                  </td>
                  <td className="sx-td" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setResetDriver(d)} disabled={loading}
                      style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>
                      Reset password
                    </button>
                    <button onClick={() => handleDeleteDriver(d.username)} disabled={loading}
                      style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  // ── LIST VIEW — mobile ──
  return (
    <div>
      <button onClick={() => setView('create')} style={{ ...S.btn('#1a56db'), width: '100%', marginBottom: 16 }}>
        ➕ Create New Driver
      </button>

      <div style={S.card()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 14 }}>Drivers ({drivers.length})</div>
        {drivers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: '#9ca3af', fontSize: 13, lineHeight: 1.6 }}>
            No drivers yet. Tap "Create New Driver" above,<br />or share Company ID <b style={{ fontFamily: 'monospace', color: '#1a56db' }}>{user?.companyId}</b> so drivers can sign up themselves.
          </div>
        ) : drivers.map(d => (
          <div key={d.username} style={{ padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>@{d.username}{typeof d.docCount === 'number' ? ` · ${d.docCount} docs` : ''}</div>
              <div style={{ marginTop: 6 }}><PayCycleSelect driver={d} onSaved={loadDrivers} notify={notify} compact /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => setResetDriver(d)} disabled={loading}
                style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Reset password
              </button>
              <button onClick={() => handleDeleteDriver(d.username)} disabled={loading}
                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {resetDriver && (
        <ResetDriverModal driver={resetDriver} notify={notify}
          onClose={() => setResetDriver(null)} />
      )}
    </div>
  )
}

// Modal: admin types a new password for a driver directly. For when a driver
// has no phone on file (can't self-reset) or just needs the office to do it.
function ResetDriverModal({ driver, onClose, notify }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (pw.length < 6) { notify('Password must be at least 6 characters', 'error'); return }
    if (pw !== pw2) { notify('Passwords do not match', 'error'); return }
    setLoading(true)
    try {
      await api.adminResetDriverPassword(driver.username, pw)
      notify(`✓ Password reset for ${driver.name}`)
      onClose()
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Reset password</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
          Set a new password for <b>{driver.name}</b> (@{driver.username}). Share it with them securely — they can change it later.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>New password</div>
        <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters"
          style={{ ...S.input, marginBottom: 12 }} disabled={loading} autoFocus />
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Repeat password</div>
        <input type="text" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Repeat"
          style={{ ...S.input, marginBottom: 18 }} disabled={loading} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={loading} style={{ ...S.btn('#1a56db'), flex: 1 }}>{loading ? 'Saving…' : 'Set password'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Company section ──────────────────────────────────────────────────────────
function CompanySection({ user, notify, wide = false }) {
  const [companyName, setCompanyName] = useState(user?.companyName || '')
  const [companyPhone, setCompanyPhone] = useState('')
  const [payFrequency, setPayFrequency] = useState('weekly')
  const [currency, setCurrency] = useState('USD')
  const [defaultEmail, setDefaultEmail] = useState(user?.notifyEmails || '')
  const [routingMode, setRoutingMode] = useState('one') // 'one' | 'perType'
  const [typeEmails, setTypeEmails] = useState({}) // { docTypeId: 'email' }
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      const s = await api.getCompanySettings()
      setCompanyName(s.name || user?.companyName || '')
      setCompanyPhone(s.phone || '')
      setPayFrequency(s.payFrequency || 'weekly')
      setCurrency(s.currency || 'USD')
      setDefaultEmail(s.notifyEmails || '')
      const te = s.docTypeEmails || {}
      setTypeEmails(te)
      // If any per-type override exists, start in per-type mode
      setRoutingMode(Object.keys(te).length > 0 ? 'perType' : 'one')
    } catch (e) { console.error('Failed to load settings:', e) }
    setLoaded(true)
  }

  const handleSaveCompany = async () => {
    setLoading(true)
    try {
      await api.updateCompanySettings({ name: companyName, email: defaultEmail, phone: companyPhone, payFrequency, currency })
      // Read back rather than trusting local state — if the server stored
      // something different, the form should show the truth immediately.
      await loadSettings()
      notify('✓ Company settings saved')
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  // Validate a comma-separated list of emails. Returns the first bad one, or null.
  const findBadEmail = (str) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const part of (str || '').split(',').map(x => x.trim()).filter(Boolean)) {
      if (!re.test(part)) return part
    }
    return null
  }

  const handleSaveRouting = async () => {
    // Catch a typo in any address before it silently fails to deliver.
    const bad = findBadEmail(defaultEmail)
    if (bad) { notify(`"${bad}" doesn't look like a valid email`, 'error'); return }
    if (routingMode === 'perType') {
      for (const [id, val] of Object.entries(typeEmails)) {
        const b = findBadEmail(val)
        if (b) {
          const label = DOC_TYPES.find(d => d.id === id)?.label || id
          notify(`${label}: "${b}" doesn't look like a valid email`, 'error')
          return
        }
      }
    }
    setLoading(true)
    try {
      // In "one email for all" mode, clear all per-type overrides.
      const payload = routingMode === 'one'
        ? { notifyEmails: defaultEmail, docTypeEmails: {} }
        : { notifyEmails: defaultEmail, docTypeEmails: typeEmails }
      await api.updateEmailRouting(payload)
      if (routingMode === 'one') setTypeEmails({})
      notify('✓ Email routing saved')
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  const setTypeEmail = (id, val) => setTypeEmails(prev => ({ ...prev, [id]: val }))

  const profileCard = (
    <div style={S.card({ marginBottom: 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 14 }}>🏢 Company profile</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Company name</div>
      <input type="text" autoComplete="off" placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 12 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Phone</div>
      <input type="text" autoComplete="off" placeholder="Phone (optional)" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 12 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Pay frequency <span style={{ fontWeight: 400, color: '#9ca3af' }}>(default for settlements — override per driver in Drivers)</span></div>
      <select value={payFrequency} onChange={e => setPayFrequency(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 16 }}>
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
        <option value="semimonthly">Semi-monthly (1st–15th, 16th–end)</option>
        <option value="monthly">Monthly</option>
      </select>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Settlement currency</div>
      <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 6 }}>
        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16, lineHeight: 1.5 }}>
        Used for new settlements. Existing settlements keep the currency they were issued in.
      </div>
      <button onClick={handleSaveCompany} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>{loading ? '⏳ Saving…' : 'Save company info'}</button>
    </div>
  )

  const routingCard = (
    <div style={S.card()}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 4 }}>📧 Document email routing</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>Choose where submitted document PDFs are emailed. Use one address for everything, or route each document type to a different address.</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setRoutingMode('one')} disabled={loading}
          style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: `2px solid ${routingMode === 'one' ? '#1a56db' : '#e5e7eb'}`, background: routingMode === 'one' ? '#eff6ff' : 'white', color: routingMode === 'one' ? '#1a56db' : '#374151' }}>
          One email for all
        </button>
        <button onClick={() => setRoutingMode('perType')} disabled={loading}
          style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: `2px solid ${routingMode === 'perType' ? '#1a56db' : '#e5e7eb'}`, background: routingMode === 'perType' ? '#eff6ff' : 'white', color: routingMode === 'perType' ? '#1a56db' : '#374151' }}>
          Route by type
        </button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>
        {routingMode === 'one' ? 'Email address(es)' : 'Default email (used for any type without a specific address)'}
      </div>
      <input type="text" inputMode="email" autoComplete="off" placeholder="pod@company.com, billing@company.com" value={defaultEmail} onChange={e => setDefaultEmail(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Send to more than one person by separating addresses with commas.</div>

      {routingMode === 'perType' && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 10, paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>Per-document-type addresses</div>
          <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: wide ? 12 : 0 }}>
            {DOC_TYPES.map(dt => (
              <div key={dt.id} style={{ marginBottom: wide ? 0 : 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>{dt.icon} {dt.label}</div>
                <input type="text" inputMode="email" autoComplete="off"
                  placeholder={defaultEmail ? `e.g. ${defaultEmail}` : 'Uses default email'}
                  value={typeEmails[dt.id] || ''} onChange={e => setTypeEmail(dt.id, e.target.value)}
                  disabled={loading} style={{ ...S.input }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', margin: '12px 0 8px' }}>Blank = uses the default email. Add several addresses with commas to send that type to multiple people.</div>
        </div>
      )}

      <button onClick={handleSaveRouting} disabled={loading || !loaded} style={{ ...S.btn('#0e9f6e'), width: '100%', marginTop: 8 }}>
        {loading ? '⏳ Saving…' : 'Save email routing'}
      </button>
    </div>
  )

  const accountCard = (
    <div style={S.card({ marginTop: wide ? 0 : 14 })}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 12 }}>Account</div>
      {[['Company', user?.companyName], ['Username', `@${user?.username || user?.name}`], ['Role', 'Administrator'], ['Company ID', user?.companyId]].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>{k}</span>
          <span style={{ fontSize: 13, color: '#111827', fontWeight: 700, fontFamily: k === 'Company ID' ? 'monospace' : 'inherit' }}>{v}</span>
        </div>
      ))}
    </div>
  )

  // Desktop: two columns — profile + account + team on the left, routing right.
  if (wide) return (
    <div style={{ display: 'grid', gridTemplateColumns: routingMode === 'perType' ? 'minmax(0,1fr) minmax(0,1.4fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      <div>
        {profileCard}
        {accountCard}
        <TeamSection notify={notify} />
      </div>
      <div>{routingCard}</div>
    </div>
  )

  // Mobile: single stack.
  return (
    <div>
      {profileCard}
      {routingCard}
      {accountCard}
      <TeamSection notify={notify} />
    </div>
  )
}


// Small per-driver pay-cycle override. Empty = follow the company default.
function PayCycleSelect({ driver, onSaved, notify, compact = false }) {
  const [saving, setSaving] = useState(false)
  const change = async (val) => {
    setSaving(true)
    try {
      await api.updateDriver(driver.username, { payFrequency: val })
      notify(val ? '✓ Pay cycle updated' : '✓ Back to company default')
      onSaved?.()
    } catch (e) { notify(e.message, 'error') }
    setSaving(false)
  }
  return (
    <select value={driver.payFrequency || ''} onChange={e => change(e.target.value)} disabled={saving}
      onClick={e => e.stopPropagation()}
      style={{ ...S.input, width: 'auto', padding: compact ? '5px 8px' : '7px 10px', fontSize: 12, background: driver.payFrequency ? '#eff6ff' : 'white' }}>
      <option value="">Company default</option>
      <option value="weekly">Weekly</option>
      <option value="biweekly">Biweekly</option>
      <option value="semimonthly">Semi-monthly</option>
      <option value="monthly">Monthly</option>
    </select>
  )
}

// ── Team (staff sub-accounts) — admin only ────────────────────────────────────
// Department logins (Accounting, Dispatch…) that can read/review documents, run
// requests, and manage settlements. Their actions carry their name.
export function TeamSection({ notify }) {
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState({ name: '', department: '', username: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    try { const d = await api.getStaff(); setStaff(d.staff || []) } catch {}
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const create = async () => {
    if (!form.name.trim()) { notify('Name is required', 'error'); return }
    if (!form.username.trim()) { notify('Username is required', 'error'); return }
    if (!form.password || form.password.length < 6) { notify('Password: at least 6 characters', 'error'); return }
    setLoading(true)
    try {
      await api.createStaff(form)
      notify('✓ Team member created')
      setForm({ name: '', department: '', username: '', password: '' })
      setCreating(false)
      load()
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  const remove = async (m) => {
    if (!confirm(`Remove ${m.name}'s login? Their past actions stay attributed to them.`)) return
    try { await api.deleteStaff(m.username); notify('Team member removed'); load() }
    catch (e) { notify(e.message, 'error') }
  }

  return (
    <div style={S.card({ marginTop: 14 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>👥 Team access</div>
        {!creating && <button onClick={() => setCreating(true)} style={{ background: '#eff6ff', color: '#1a56db', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add member</button>}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
        Logins for departments like Accounting or Dispatch. They can review documents, request documents, and manage pay settlements — every action shows their name. They can't change settings or manage drivers.
      </div>

      {creating && (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <form autoComplete="off" onSubmit={e => { e.preventDefault(); create() }}>
            <input name="sx-team-name" autoComplete="off" placeholder="Full name (e.g. Priya Patel)" value={form.name} onChange={e => set('name', e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 8 }} />
            <input name="sx-team-dept" autoComplete="off" placeholder="Department (e.g. Accounting, Dispatch)" value={form.department} onChange={e => set('department', e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 8 }} />
            <input name="sx-team-user" autoComplete="off" autoCapitalize="none" placeholder="Username (e.g. priya.acct)" value={form.username} onChange={e => set('username', e.target.value.toLowerCase())} disabled={loading} style={{ ...S.input, marginBottom: 8, fontFamily: 'monospace' }} />
            <input type="password" name="sx-team-pw" autoComplete="new-password" placeholder="Password (min 6 characters)" value={form.password} onChange={e => set('password', e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={loading} style={{ ...S.btn('#0e9f6e') }}>{loading ? 'Creating…' : 'Create login'}</button>
              <button type="button" onClick={() => setCreating(false)} style={{ ...S.btn('#6b7280') }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {staff.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af' }}>No team members yet.</div>
      ) : staff.map(m => (
        <div key={m.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{m.department} · <span style={{ fontFamily: 'monospace' }}>@{m.username}</span></div>
          </div>
          <button onClick={() => remove(m)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
        </div>
      ))}
    </div>
  )
}
