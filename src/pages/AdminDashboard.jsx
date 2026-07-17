// src/pages/AdminDashboard.jsx
import { useState, useEffect, useMemo } from 'react'
import { S, getDocType } from '../lib/constants'
import { Badge, Skeleton, ConfirmDialog, shimmerKeyframes } from '../components/Shared'
import ScannedDoc from '../components/ScannedDoc'
import { api } from '../lib/api'
import CompanySettingsPage from './CompanySettingsPage'
import DocRequestsPage from './DocRequestsPage'
import SettlementsPage from './SettlementsPage'
import { useBreakpoints } from '../lib/useMediaQuery'

// Desktop-only CSS — hover states can't be expressed as inline styles.
const desktopCss = `
  .sx-row { transition: background 120ms ease; cursor: pointer; }
  .sx-row:hover { background: #f8fafc; }
  .sx-navlink:hover { color: #ffffff !important; }
  .sx-th { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;
           letter-spacing: 0.6px; text-align: left; padding: 12px 16px;
           border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
  .sx-td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px;
           color: #111827; vertical-align: middle; }
`

// Staff (department sub-accounts) get the working tabs; company management is
// admin-only. Backend enforces the same split — this just hides dead doors.
const navFor = role => role === 'staff'
  ? [['docs', 'Documents'], ['requests', 'Requests'], ['pay', 'Pay']]
  : [['docs', 'Documents'], ['requests', 'Requests'], ['pay', 'Pay'], ['drivers', 'Drivers'], ['settings', 'Settings']]
const CONTENT_MAX = 1280

export default function AdminDashboard({ user, onLogout, toast }) {
  const { isTablet } = useBreakpoints()
  const [tab, setTab] = useState('docs')
  const [docs, setDocs] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewDoc, setViewDoc] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [docsData, driversData] = await Promise.all([api.getCompanyDocuments(), api.getDrivers()])
      setDocs(docsData.documents || [])
      setDrivers(driversData.drivers || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let d = docs
    if (filterStatus !== 'all') d = d.filter(x => x.status === filterStatus)
    if (search) {
      const q = search.toLowerCase()
      d = d.filter(x => (x.driverName || '').toLowerCase().includes(q) || (x.docNumber || '').toLowerCase().includes(q) || getDocType(x.docType).label.toLowerCase().includes(q))
    }
    return d
  }, [docs, filterStatus, search])

  const deleteDoc = async (doc) => {
    try {
      await api.deleteDocument(doc.id)
      setDocs(p => p.filter(d => d.id !== doc.id))
      setViewDoc(null); setConfirm(null)
      toast('Document deleted', 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  const copyId = () => { navigator.clipboard?.writeText(user.companyId).catch(() => {}); toast('Company ID copied!') }

  const stats = useMemo(() => ({
    total: docs.length,
    pending: docs.filter(d => d.status === 'pending').length,
    reviewed: docs.filter(d => d.status === 'reviewed').length,
  }), [docs])

  if (viewDoc) return (
    <AdminDocDetail doc={viewDoc} onBack={() => { setViewDoc(null); load() }}
      onDelete={() => setConfirm({ msg: `Delete this ${getDocType(viewDoc.docType).label}?`, onConfirm: () => deleteDoc(viewDoc) })}
      toast={toast} confirm={confirm} setConfirm={setConfirm} canDelete={user.role !== 'staff'} />
  )

  // ═══════════════════ DESKTOP / TABLET — website layout ═══════════════════
  if (isTablet) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui,sans-serif' }}>
      <style>{desktopCss}{shimmerKeyframes}</style>
      {confirm && <ConfirmDialog title="Delete Document" message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* Full-width site header with horizontal nav */}
      <header style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'white', letterSpacing: -0.3 }}>SyncX Pro</span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>{user.companyName}</span>
            {user.role === 'staff' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.2)', color: '#93c5fd' }}>
                {user.name}{user.department ? ` · ${user.department}` : ''}
              </span>
            )}
          </div>

          <nav style={{ display: 'flex', gap: 4, alignSelf: 'stretch', flex: 1 }}>
            {navFor(user.role).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className="sx-navlink" style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 16px',
                fontSize: 14, fontWeight: 600, color: tab === id ? 'white' : 'rgba(255,255,255,0.5)',
                borderBottom: `2px solid ${tab === id ? '#3b82f6' : 'transparent'}`,
              }}>{label}</button>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <button onClick={copyId} title="Copy Company ID" style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', borderRadius: 8,
              padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#60a5fa', fontWeight: 700 }}>{user.companyId}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>copy</span>
            </button>
            <button onClick={onLogout} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)',
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>Sign out</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '28px 32px 60px' }}>
        {tab === 'docs' && <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Documents</h1>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
            {[['Total', stats.total, '#1a56db'], ['Pending', stats.pending, '#e3a008'], ['Reviewed', stats.reviewed, '#0e9f6e']].map(([l, n, c]) => (
              <div key={l} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 4, height: 34, borderRadius: 4, background: c }} />
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 4 }}>{l}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver, document number, or type…"
              style={{ ...S.input, flex: 1, maxWidth: 420, padding: '10px 14px', fontSize: 14, background: 'white' }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ ...S.input, width: 'auto', padding: '10px 12px', fontSize: 14, background: 'white' }}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20 }}>{[1, 2, 3].map(i => <Skeleton key={i} h={54} />)}</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>{search || filterStatus !== 'all' ? 'No matching documents' : 'No documents yet'}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{search || filterStatus !== 'all' ? 'Try a different search or filter.' : 'Documents submitted by your drivers appear here.'}</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="sx-th" style={{ width: 58 }}></th>
                    <th className="sx-th">Document</th>
                    <th className="sx-th">Document number</th>
                    <th className="sx-th">Driver</th>
                    <th className="sx-th">Submitted</th>
                    <th className="sx-th">Status</th>
                    <th className="sx-th" style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(doc => {
                    const dt = getDocType(doc.docType)
                    const pageCount = doc.pageCount || doc.pages?.length || 1
                    return (
                      <tr key={doc.id} className="sx-row" onClick={() => setViewDoc(doc)}>
                        <td className="sx-td" style={{ paddingRight: 0 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', background: '#f9fafb', borderLeft: `3px solid ${dt.color}` }}>
                            <ScannedDoc src={doc.src} corners={doc.corners} filterMode={doc.filterMode} brightness={doc.brightness} contrast={doc.contrast} />
                          </div>
                        </td>
                        <td className="sx-td">
                          <div style={{ fontWeight: 700 }}>{dt.icon} {dt.label}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 6 }}>
                            {pageCount > 1 && <span style={{ background: '#eff6ff', color: '#1a56db', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>{pageCount}p</span>}
                            {doc.pdfUrl && <span style={{ background: '#fff5f5', color: '#e02424', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>PDF</span>}
                          </div>
                        </td>
                        <td className="sx-td" style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563' }}>{doc.docNumber || '—'}</td>
                        <td className="sx-td">{doc.driverName}</td>
                        <td className="sx-td" style={{ color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {new Date(doc.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="sx-td"><Badge status={doc.status} /></td>
                        <td className="sx-td" style={{ color: '#d1d5db', fontSize: 18 }}>›</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>}

        {tab === 'requests' && <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Requests</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
            Ask a driver for a specific document. It arrives in their app pre-filled.
          </p>
          <DocRequestsPage user={user} toast={toast} wide />
        </>}

        {tab === 'pay' && <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Pay settlements</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
            Deliver settlement PDFs to drivers and answer their questions in one thread.
          </p>
          <SettlementsPage user={user} toast={toast} wide />
        </>}

        {tab === 'drivers' && user.role !== 'staff' && <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Drivers</h1>
          <CompanySettingsPage user={user} toast={toast} section="drivers" wide />
        </>}

        {tab === 'settings' && user.role !== 'staff' && <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Settings</h1>
          <CompanySettingsPage user={user} toast={toast} section="company" wide />
        </>}
      </main>
    </div>
  )

  // ═══════════════════ MOBILE — unchanged app layout ═══════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui,sans-serif' }}>
      {confirm && <ConfirmDialog title="Delete Document" message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '20px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Admin Dashboard</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 2 }}>{user.companyName}</div>
            <button onClick={copyId} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#60a5fa', fontWeight: 700 }}>{user.companyId}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>tap to copy</span>
            </button>
          </div>
          <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.65)', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Sign Out</button>
        </div>
        <div style={{ display: 'flex' }}>
          {(user.role === 'staff' ? [['docs', '📄', 'Docs'], ['requests', '📨', 'Requests'], ['pay', '💵', 'Pay']] : [['docs', '📄', 'Docs'], ['requests', '📨', 'Requests'], ['pay', '💵', 'Pay'], ['drivers', '🚛', 'Drivers'], ['settings', '⚙️', 'Settings']]).map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '10px 0 13px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? '#3b82f6' : 'transparent'}`, color: tab === id ? 'white' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 17 }}>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.page}>
        {tab === 'docs' && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[['Total', stats.total, '#1a56db'], ['Pending', stats.pending, '#e3a008'], ['Reviewed', stats.reviewed, '#0e9f6e']].map(([l, n, c]) => (
              <div key={l} style={{ background: 'white', borderRadius: 14, padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: c }}>{n}</div>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver, doc #, type…"
              style={{ ...S.input, flex: 1, padding: '10px 14px', fontSize: 14 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ ...S.input, width: 'auto', padding: '10px 12px', fontSize: 13 }}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          {loading ? [1, 2, 3].map(i => <Skeleton key={i} h={80} />) :
            filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#9ca3af' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>{search || filterStatus !== 'all' ? 'No matches found' : 'No documents yet'}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{search || filterStatus !== 'all' ? 'Try adjusting filters' : 'Documents submitted by drivers appear here'}</div>
              </div>
            ) : filtered.map(doc => {
              const dt = getDocType(doc.docType)
              const pageCount = doc.pageCount || doc.pages?.length || 1
              return (
                <div key={doc.id} onClick={() => setViewDoc(doc)} style={{ background: 'white', borderRadius: 16, marginBottom: 10, overflow: 'hidden', display: 'flex', alignItems: 'stretch', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', cursor: 'pointer' }}>
                  <div style={{ width: 5, background: dt.color, flexShrink: 0 }} />
                  <div style={{ width: 66, flexShrink: 0, overflow: 'hidden', background: '#f9fafb', display: 'flex', alignItems: 'center' }}>
                    <ScannedDoc src={doc.src} corners={doc.corners} filterMode={doc.filterMode} brightness={doc.brightness} contrast={doc.contrast} />
                  </div>
                  <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dt.icon} {dt.label}</div>
                      <Badge status={doc.status} />
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280', marginTop: 3 }}>{doc.docNumber || 'No number'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pageCount > 1 && <span style={{ background: '#eff6ff', color: '#1a56db', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>{pageCount}p</span>}
                      {doc.pdfUrl && <span style={{ background: '#fff5f5', color: '#e02424', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>PDF</span>}
                      <span>{doc.driverName} · {new Date(doc.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center', color: '#d1d5db', fontSize: 20 }}>›</div>
                </div>
              )
            })}
        </>}

        {tab === 'requests' && <DocRequestsPage user={user} toast={toast} />}
        {tab === 'pay' && <SettlementsPage user={user} toast={toast} />}
        {tab === 'drivers' && user.role !== 'staff' && <CompanySettingsPage user={user} toast={toast} section="drivers" />}
        {tab === 'settings' && user.role !== 'staff' && <CompanySettingsPage user={user} toast={toast} section="company" />}
      </div>
      <style>{shimmerKeyframes}</style>
    </div>
  )
}

// ── Admin Document Detail ──────────────────────────────────────────────────────
function AdminDocDetail({ doc, onBack, onDelete, toast, confirm, setConfirm, canDelete = true }) {
  const { isTablet } = useBreakpoints()
  const [status, setStatus] = useState('reviewed') // opening a doc marks it reviewed
  const [notes, setNotes] = useState(doc.adminNotes || '')
  const [saving, setSaving] = useState(false)
  const [viewingPage, setViewingPage] = useState(0)
  const dt = getDocType(doc.docType)
  const allPages = doc.pages?.length > 0 ? doc.pages : [{ src: doc.src, corners: doc.corners, filterMode: doc.filterMode, brightness: doc.brightness, contrast: doc.contrast }]

  // Auto-review: opening a pending document marks it reviewed automatically.
  useEffect(() => {
    if (doc.status !== 'reviewed') {
      api.updateDocument(doc.id, { status: 'reviewed' }).catch(() => {})
    }
  }, [doc.id])

  const save = async () => {
    setSaving(true)
    try { await api.updateDocument(doc.id, { status, adminNotes: notes }); toast('Saved ✓') }
    catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const infoRows = [
    ['Driver', doc.driverName],
    ['Username', `@${doc.driverUsername || '—'}`],
    ['Document number', doc.docNumber || '—'],
    ['Location', doc.gpsLocation ? (doc.gpsLocation.label || `${doc.gpsLocation.latitude.toFixed(4)}, ${doc.gpsLocation.longitude.toFixed(4)}`) : '—'],
    ['Pages', `${allPages.length}`],
    ['Submitted', new Date(doc.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
    ...(doc.reviewedBy ? [['Reviewed by', `${doc.reviewedBy.name}${doc.reviewedBy.department ? ` (${doc.reviewedBy.department})` : ''}`]] : []),
  ]

  const pageViewer = (
    <div style={{ background: '#64748b', padding: isTablet ? 20 : 14, borderRadius: 14 }}>
      {allPages.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => setViewingPage(p => Math.max(0, p - 1))} disabled={viewingPage === 0}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: viewingPage === 0 ? .4 : 1 }}>‹</button>
          <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>Page {viewingPage + 1} of {allPages.length}</span>
          <button onClick={() => setViewingPage(p => Math.min(allPages.length - 1, p + 1))} disabled={viewingPage === allPages.length - 1}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: viewingPage === allPages.length - 1 ? .4 : 1 }}>›</button>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 3, overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
        <ScannedDoc src={allPages[viewingPage]?.src} corners={allPages[viewingPage]?.corners}
          filterMode={allPages[viewingPage]?.filterMode} brightness={allPages[viewingPage]?.brightness}
          contrast={allPages[viewingPage]?.contrast} />
      </div>
      {allPages.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {allPages.map((p, i) => (
            <div key={i} onClick={() => setViewingPage(i)} style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden', border: `2px solid ${viewingPage === i ? '#3b82f6' : 'rgba(255,255,255,0.3)'}`, cursor: 'pointer', background: 'white' }}>
              <ScannedDoc src={p.src} corners={p.corners} filterMode={p.filterMode} brightness={p.brightness} contrast={p.contrast} />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const sidePanel = (
    <>
      {doc.pdfUrl && (
        <a href={doc.pdfUrl} target="_blank" rel="noreferrer"
          style={{ ...S.btn('#0e9f6e', { textDecoration: 'none', textAlign: 'center', display: 'block', marginBottom: 14 }) }}>
          📥 Download PDF ({allPages.length} page{allPages.length !== 1 ? 's' : ''})
        </a>
      )}

      <div style={S.card({ marginBottom: 14 })}>
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 10 }}>
          {infoRows.map(([k, v]) => (
            <div key={k} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card({ marginBottom: 14 })}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Status</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Auto-marked reviewed when opened. Switch back to pending if you still need to follow up.</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['pending', 'reviewed'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, border: `2px solid ${status === s ? '#1a56db' : '#e5e7eb'}`, background: status === s ? '#eff6ff' : 'white', color: status === s ? '#1a56db' : '#374151' }}>
              {s === 'pending' ? '⏳ Pending' : '✓ Reviewed'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Notes for driver</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Add notes visible to the driver…" style={{ ...S.input, resize: 'vertical' }} />
        <button onClick={save} disabled={saving} style={{ ...S.btn('#1a56db'), width: '100%', marginTop: 14 }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {canDelete && <button onClick={onDelete} style={{ ...S.btn('#e02424'), width: '100%' }}>🗑 Delete document</button>}
    </>
  )

  // ── DESKTOP / TABLET: two-column review ──
  if (isTablet) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui,sans-serif' }}>
      <style>{desktopCss}</style>
      {confirm && <ConfirmDialog title="Delete Document" message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      <header style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Back to documents</button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{dt.icon} {dt.label}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{allPages.length} page{allPages.length !== 1 ? 's' : ''} · {doc.driverName}</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '28px 32px 60px', display: 'grid', gridTemplateColumns: 'minmax(0,1.9fr) minmax(320px,1fr)', gap: 24, alignItems: 'start' }}>
        <div>{pageViewer}</div>
        <div style={{ position: 'sticky', top: 88 }}>{sidePanel}</div>
      </main>
    </div>
  )

  // ── MOBILE: unchanged ──
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui,sans-serif' }}>
      {confirm && <ConfirmDialog title="Delete Document" message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '20px 16px 18px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 10, padding: '7px 13px', cursor: 'pointer', fontSize: 16 }}>←</button>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              Review · {allPages.length} page{allPages.length !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>{dt.icon} {dt.label}</div>
          </div>
        </div>
      </div>

      <div style={S.page}>
        <div style={{ marginBottom: 16 }}>{pageViewer}</div>
        {sidePanel}
      </div>
    </div>
  )
}
