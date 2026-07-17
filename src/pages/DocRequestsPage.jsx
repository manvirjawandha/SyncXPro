import { useState, useEffect } from 'react'
import { S, DOC_TYPES, getDocType } from '../lib/constants'
import { api } from '../lib/api'

// Admin-side document requests: "send me the POD for load A12345".
// The driver sees it waiting in their app with the type and number already
// filled in — they just scan, add location, and submit.
//
// `wide` = rendered inside the desktop website layout (table instead of cards).
export default function DocRequestsPage({ user, toast, wide = false }) {
  const [view, setView] = useState('list') // 'list' | 'create'
  const [requests, setRequests] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [r, d] = await Promise.all([api.getDocRequests(), api.getDrivers()])
      setRequests(r.requests || [])
      setDrivers(d.drivers || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const cancel = async (req) => {
    if (!confirm(`Cancel the ${getDocType(req.docType).label} request for ${req.driverName}?`)) return
    try { await api.cancelDocRequest(req.id); toast('Request cancelled'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  if (view === 'create') return (
    <CreateRequest drivers={drivers} wide={wide} toast={toast}
      onCancel={() => setView('list')}
      onDone={() => { setView('list'); load() }} />
  )

  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          {pending.length} awaiting {pending.length === 1 ? 'a driver' : 'drivers'}
        </div>
        <button onClick={() => setView('create')} style={{ ...S.btn('#1a56db'), flex: 'none', padding: '10px 16px' }}>
          + Request document
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ ...S.card(), textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📨</div>
          <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>No requests yet</div>
          <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            Ask a driver for a specific document and it appears in their app,<br />
            pre-filled and ready to scan.
          </div>
        </div>
      ) : wide ? (
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="sx-th">Driver</th>
                <th className="sx-th">Document</th>
                <th className="sx-th">Number</th>
                <th className="sx-th">Note</th>
                <th className="sx-th">Requested</th>
                <th className="sx-th">Status</th>
                <th className="sx-th" style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const dt = getDocType(r.docType)
                const done = r.status === 'fulfilled'
                return (
                  <tr key={r.id} style={{ opacity: done ? 0.55 : 1 }}>
                    <td className="sx-td" style={{ fontWeight: 700 }}>{r.driverName}</td>
                    <td className="sx-td">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 7, background: dt.color }} />
                        {dt.icon} {dt.label}
                      </span>
                    </td>
                    <td className="sx-td" style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563' }}>{r.docNumber || '—'}</td>
                    <td className="sx-td" style={{ color: '#6b7280', fontSize: 13, maxWidth: 220 }}>{r.note || '—'}</td>
                    <td className="sx-td" style={{ color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="sx-td">
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', background: done ? '#dcfce7' : '#fef3c7', color: done ? '#166534' : '#92400e' }}>
                        {done ? '✓ Received' : 'Waiting'}
                      </span>
                    </td>
                    <td className="sx-td" style={{ textAlign: 'right' }}>
                      {!done && (
                        <button onClick={() => cancel(r)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        requests.map(r => {
          const dt = getDocType(r.docType)
          const done = r.status === 'fulfilled'
          return (
            <div key={r.id} style={{ ...S.card({ marginBottom: 10 }), opacity: done ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{dt.icon} {dt.label}</div>
                  <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4, lineHeight: 1.7 }}>
                    <div>From <b>{r.driverName}</b></div>
                    {r.docNumber && <div style={{ fontFamily: 'monospace' }}>{r.docNumber}</div>}
                    {r.note && <div style={{ color: '#6b7280' }}>{r.note}</div>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', background: done ? '#dcfce7' : '#fef3c7', color: done ? '#166534' : '#92400e' }}>
                  {done ? '✓ Received' : 'Waiting'}
                </span>
              </div>
              {!done && (
                <button onClick={() => cancel(r)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}>
                  Cancel request
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function CreateRequest({ drivers, onDone, onCancel, toast, wide }) {
  const [form, setForm] = useState({ driverUsername: '', docType: '', docNumber: '', note: '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.driverUsername) { toast('Choose a driver', 'error'); return }
    if (!form.docType) { toast('Choose a document type', 'error'); return }
    setLoading(true)
    try {
      await api.createDocRequest(form)
      toast('✓ Request sent to the driver', 'success')
      onDone()
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: wide ? 560 : 'none' }}>
      <button onClick={onCancel} style={{ background: 'white', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
        ← Back to requests
      </button>

      <div style={S.card()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Request a document</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18, lineHeight: 1.5 }}>
          It shows up in the driver's app pre-filled. They scan, add location, and submit — nothing to type.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Driver *</div>
        {drivers.length === 0 ? (
          <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            You have no drivers yet. Add one in the Drivers tab first.
          </div>
        ) : (
          <select value={form.driverUsername} onChange={e => set('driverUsername', e.target.value)} disabled={loading}
            style={{ ...S.input, marginBottom: 12 }}>
            <option value="">Choose a driver…</option>
            {drivers.map(d => <option key={d.username} value={d.username}>{d.name} (@{d.username})</option>)}
          </select>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Document type *</div>
        <select value={form.docType} onChange={e => set('docType', e.target.value)} disabled={loading}
          style={{ ...S.input, marginBottom: 12 }}>
          <option value="">Choose a type…</option>
          {DOC_TYPES.map(d => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}
        </select>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>
          Document number <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional — fills in for them)</span>
        </div>
        <input value={form.docNumber} onChange={e => set('docNumber', e.target.value)} disabled={loading}
          placeholder="e.g. A12345678" autoComplete="off"
          style={{ ...S.input, marginBottom: 12, fontFamily: 'monospace' }} />

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>
          Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
        </div>
        <textarea value={form.note} onChange={e => set('note', e.target.value)} disabled={loading} rows={2}
          placeholder="e.g. Need this for billing before Friday"
          style={{ ...S.input, marginBottom: 20, resize: 'vertical' }} />

        <button onClick={submit} disabled={loading || drivers.length === 0} style={{ ...S.btn('#1a56db'), width: '100%' }}>
          {loading ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  )
}
