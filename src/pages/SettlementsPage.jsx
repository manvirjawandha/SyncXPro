import { useState, useEffect } from 'react'
import { S, CURRENCIES, formatMoney } from '../lib/constants'
import { api } from '../lib/api'

// Pay settlements (admin + staff). Accounting uploads the settlement PDF their
// payroll already produced — SyncX Pro delivers and hosts the discussion; it never
// calculates pay. Pay period pre-fills by advancing the driver's previous
// settlement one cycle (weekly/biweekly/semi-monthly/monthly) and stays editable.
const FREQ_LABEL = { weekly: 'Weekly', biweekly: 'Biweekly', semimonthly: 'Semi-monthly', monthly: 'Monthly' }
// Each settlement carries the currency it was issued in.
const fmtMoney = (n, cur) => formatMoney(n, cur)
const fmtDate = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_PILL = {
  issued:   { bg: '#eff6ff', fg: '#1a56db', label: 'Issued' },
  queried:  { bg: '#fef3c7', fg: '#92400e', label: '⚠ Query open' },
  resolved: { bg: '#dcfce7', fg: '#166534', label: '✓ Resolved' },
}

export default function SettlementsPage({ user, toast, wide = false }) {
  const [view, setView] = useState('list') // list | create
  const [settlements, setSettlements] = useState([])
  const [drivers, setDrivers] = useState([])
  const [openId, setOpenId] = useState(null) // expanded thread
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([api.getSettlements(), api.getDrivers()])
      setSettlements(s.settlements || [])
      setDrivers(d.drivers || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  if (view === 'create') return (
    <UploadSettlement drivers={drivers} wide={wide} toast={toast}
      onCancel={() => setView('list')} onDone={() => { setView('list'); load() }} />
  )

  const queried = settlements.filter(s => s.status === 'queried').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          {settlements.length} settlement{settlements.length !== 1 ? 's' : ''}{queried > 0 ? ` · ${queried} open quer${queried > 1 ? 'ies' : 'y'}` : ''}
        </div>
        <button onClick={() => setView('create')} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '10px 16px' }}>
          + Upload settlement
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div>
      ) : settlements.length === 0 ? (
        <div style={{ ...S.card(), textAlign: 'center', padding: '50px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💵</div>
          <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>No settlements yet</div>
          <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            Upload a driver's settlement PDF and it lands in their app —<br />with a thread for any questions about it.
          </div>
        </div>
      ) : wide ? (
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="sx-th">Driver</th>
                <th className="sx-th">Pay period</th>
                <th className="sx-th">Deposited</th>
                <th className="sx-th">Amount</th>
                <th className="sx-th">Uploaded by</th>
                <th className="sx-th">Status</th>
                <th className="sx-th" style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(sett => (
                <SettlementTableRow key={sett.id} sett={sett} isAdmin={user.role === 'admin'}
                  open={openId === sett.id} onToggle={() => setOpenId(openId === sett.id ? null : sett.id)}
                  onChange={load} toast={toast} />
              ))}
            </tbody>
          </table>
        </div>
      ) : settlements.map(sett => (
        <SettlementRow key={sett.id} sett={sett} isAdmin={user.role === 'admin'}
          open={openId === sett.id} onToggle={() => setOpenId(openId === sett.id ? null : sett.id)}
          onChange={load} toast={toast} />
      ))}
    </div>
  )
}

// Desktop row: a normal table row that expands into a full-width detail row
// beneath it (PDF, status actions, and the query thread).
function SettlementTableRow({ sett, open, onToggle, onChange, toast, isAdmin }) {
  const pill = STATUS_PILL[sett.status] || STATUS_PILL.issued
  return (
    <>
      <tr className="sx-row" onClick={onToggle}>
        <td className="sx-td" style={{ fontWeight: 700 }}>{sett.driverName}</td>
        <td className="sx-td" style={{ color: '#4b5563', fontSize: 13, whiteSpace: 'nowrap' }}>
          {fmtDate(sett.periodStart)} – {fmtDate(sett.periodEnd)}
        </td>
        <td className="sx-td" style={{ color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(sett.depositDate)}</td>
        <td className="sx-td" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtMoney(sett.amount, sett.currency)}</td>
        <td className="sx-td" style={{ fontSize: 13, color: '#6b7280' }}>
          {sett.uploadedBy?.name || '—'}
          {sett.uploadedBy?.department && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sett.uploadedBy.department}</div>}
        </td>
        <td className="sx-td">
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: pill.bg, color: pill.fg, whiteSpace: 'nowrap' }}>{pill.label}</span>
        </td>
        <td className="sx-td" style={{ color: '#d1d5db', fontSize: 13 }}>{open ? '▲' : '▼'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ background: '#fafbfc', padding: '16px 18px' }}>
              <SettlementDetailBody sett={sett} isAdmin={isAdmin} onChange={onChange} toast={toast} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SettlementRow({ sett, open, onToggle, onChange, toast, isAdmin }) {
  const pill = STATUS_PILL[sett.status] || STATUS_PILL.issued
  return (
    <div style={{ ...S.card({ marginBottom: 10, padding: 0 }), overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{sett.driverName}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {fmtDate(sett.periodStart)} – {fmtDate(sett.periodEnd)} · deposited {fmtDate(sett.depositDate)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            Uploaded by {sett.uploadedBy?.name || '—'}{sett.uploadedBy?.department ? ` (${sett.uploadedBy.department})` : ''}
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{fmtMoney(sett.amount, sett.currency)}</div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: pill.bg, color: pill.fg, whiteSpace: 'nowrap' }}>{pill.label}</span>
        <span style={{ color: '#d1d5db', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 18px', background: '#fafbfc' }}>
          <SettlementDetailBody sett={sett} isAdmin={isAdmin} onChange={onChange} toast={toast} />
        </div>
      )}
    </div>
  )
}

// Shared expanded content — used by the mobile card and the desktop table row,
// so the two views can never drift apart. Module scope keeps the reply input
// from remounting (and losing focus) on every keystroke.
function SettlementDetailBody({ sett, onChange, toast, isAdmin }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { await api.commentSettlement(sett.id, text.trim()); setText(''); onChange() }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  const setStatus = async (status) => {
    setBusy(true)
    try { await api.setSettlementStatus(sett.id, status); onChange() }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  const del = async () => {
    if (!confirm(`Delete the ${fmtDate(sett.periodStart)} – ${fmtDate(sett.periodEnd)} settlement for ${sett.driverName}?`)) return
    setBusy(true)
    try { await api.deleteSettlement(sett.id); toast('Settlement deleted'); onChange() }
    catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {sett.pdfUrl && (
          <a href={sett.pdfUrl} target="_blank" rel="noreferrer" style={{ background: '#0e9f6e', color: 'white', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            📥 Settlement PDF
          </a>
        )}
        {sett.status === 'queried' && (
          <button onClick={() => setStatus('resolved')} disabled={busy} style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ✓ Mark resolved
          </button>
        )}
        {sett.status === 'resolved' && (
          <button onClick={() => setStatus('queried')} disabled={busy} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Reopen query
          </button>
        )}
        {isAdmin && (
          <button onClick={del} disabled={busy} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
            Delete
          </button>
        )}
      </div>

      <Thread comments={sett.comments} />

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Reply to the driver… (e.g. Noted — added to next settlement)"
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          style={{ ...S.input, background: 'white' }} disabled={busy} />
        <button onClick={send} disabled={busy || !text.trim()} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '0 18px' }}>Send</button>
      </div>
    </div>
  )
}

export function Thread({ comments }) {
  if (!comments?.length) return (
    <div style={{ fontSize: 13, color: '#9ca3af', padding: '6px 0' }}>No messages yet.</div>
  )
  return (
    <div>
      {comments.map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: c.side === 'office' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
          <div style={{
            maxWidth: '82%', borderRadius: 12, padding: '9px 12px',
            background: c.side === 'office' ? '#eff6ff' : 'white',
            border: `1px solid ${c.side === 'office' ? '#bfdbfe' : '#e5e7eb'}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.side === 'office' ? '#1a56db' : '#6b7280', marginBottom: 3 }}>
              {c.by?.name || '—'}{c.by?.department ? ` · ${c.by.department}` : ''}
              <span style={{ fontWeight: 400, color: '#9ca3af' }}> · {new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.5 }}>{c.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function UploadSettlement({ drivers, onDone, onCancel, toast, wide }) {
  const [form, setForm] = useState({ driverUsername: '', amount: '', depositDate: '', periodStart: '', periodEnd: '', currency: 'USD' })
  const [pdf, setPdf] = useState(null) // { name, dataUrl }
  const [freq, setFreq] = useState(null)
  const [autoFilled, setAutoFilled] = useState(false)
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Start from the company's currency; still editable per settlement for the
  // odd cross-border run.
  useEffect(() => {
    api.getCompanySettings()
      .then(s => { if (s.currency) setForm(p => ({ ...p, currency: s.currency })) })
      .catch(() => { /* keep USD default */ })
  }, [])

  // Driver chosen → fetch their suggested next period (previous + one cycle).
  const chooseDriver = async (username) => {
    set('driverUsername', username)
    setFreq(null); setAutoFilled(false)
    if (!username) return
    try {
      const d = await api.getNextPayPeriod(username)
      setFreq(d.frequency)
      if (d.suggestion) {
        setForm(p => ({ ...p, driverUsername: username, periodStart: d.suggestion.periodStart, periodEnd: d.suggestion.periodEnd }))
        setAutoFilled(true)
      }
    } catch { /* first settlement or offline — admin picks dates manually */ }
  }

  const handlePdf = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') { toast('Attach a PDF file', 'error'); return }
    if (file.size > 10 * 1024 * 1024) { toast('PDF too large (10 MB max)', 'error'); return }
    const r = new FileReader()
    r.onload = ev => setPdf({ name: file.name, dataUrl: ev.target.result })
    r.readAsDataURL(file)
  }

  const submit = async () => {
    if (!form.driverUsername) { toast('Choose a driver', 'error'); return }
    if (!form.periodStart || !form.periodEnd) { toast('Set the pay period', 'error'); return }
    if (form.periodEnd < form.periodStart) { toast('Period end is before its start', 'error'); return }
    if (!form.depositDate) { toast('Set the deposit date', 'error'); return }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast('Enter the amount', 'error'); return }
    if (!pdf) { toast('Attach the settlement PDF', 'error'); return }
    setLoading(true)
    try {
      await api.createSettlement({ ...form, amount: parseFloat(form.amount), pdf: pdf.dataUrl })
      toast('✓ Settlement sent to the driver', 'success')
      onDone()
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: wide ? 560 : 'none' }}>
      <button onClick={onCancel} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
        ← Back to settlements
      </button>

      <div style={S.card()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Upload a settlement</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18, lineHeight: 1.5 }}>
          The PDF from your payroll, delivered to the driver's app. They can ask about it and you answer in the thread.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Driver *</div>
        <select value={form.driverUsername} onChange={e => chooseDriver(e.target.value)} disabled={loading} style={{ ...S.input, marginBottom: 6 }}>
          <option value="">Choose a driver…</option>
          {drivers.map(d => <option key={d.username} value={d.username}>{d.name} (@{d.username})</option>)}
        </select>
        {freq && (
          <div style={{ fontSize: 12, color: autoFilled ? '#166534' : '#6b7280', marginBottom: 12 }}>
            {FREQ_LABEL[freq] || freq} pay cycle{autoFilled ? ' — period below advanced from their last settlement. Adjust if needed.' : ' — first settlement for this driver, pick the period.'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Period start *</div>
            <input type="date" value={form.periodStart} onChange={e => { set('periodStart', e.target.value); setAutoFilled(false) }} disabled={loading} style={S.input} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Period end *</div>
            <input type="date" value={form.periodEnd} onChange={e => { set('periodEnd', e.target.value); setAutoFilled(false) }} disabled={loading} style={S.input} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Deposit date *</div>
            <input type="date" value={form.depositDate} onChange={e => set('depositDate', e.target.value)} disabled={loading} style={S.input} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Amount *</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="0" step="0.01" placeholder="2450.00" value={form.amount} onChange={e => set('amount', e.target.value)} disabled={loading} style={{ ...S.input, fontFamily: 'monospace', flex: 1 }} />
              <select value={form.currency} onChange={e => set('currency', e.target.value)} disabled={loading}
                style={{ ...S.input, width: 'auto', flex: 'none', fontWeight: 700 }}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '14px 0 5px' }}>Settlement PDF *</div>
        {pdf ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
            <span style={{ fontSize: 13, color: '#166534', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {pdf.name}</span>
            <button onClick={() => setPdf(null)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
          </div>
        ) : (
          <label style={{ display: 'block', border: '2px dashed #cbd5e1', borderRadius: 12, padding: '18px 14px', textAlign: 'center', cursor: 'pointer', marginBottom: 18, color: '#6b7280', fontSize: 13, fontWeight: 600 }}>
            Tap to attach the PDF
            <input type="file" accept="application/pdf" onChange={handlePdf} style={{ display: 'none' }} />
          </label>
        )}

        <button onClick={submit} disabled={loading} style={{ ...S.btn('#1a56db'), width: '100%' }}>
          {loading ? 'Uploading…' : 'Send to driver'}
        </button>
      </div>
    </div>
  )
}
