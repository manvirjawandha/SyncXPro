// src/components/Shared.jsx
import { S } from '../lib/constants'

export function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={S.label}>{label}</label>}
      {children}
      {hint && !error && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
      {error && <div style={{ fontSize: 12, color: '#e02424', marginTop: 5, fontWeight: 600 }}>{error}</div>}
    </div>
  )
}

export function Badge({ status }) {
  const MAP = {
    pending: ['#e3a008', '#fffbeb', '⏳ Pending'],
    reviewed: ['#0e9f6e', '#f0fdf4', '✓ Reviewed'],
    expired: ['#e02424', '#fff5f5', '⚠ Expired'],
  }
  const [c, bg, label] = MAP[status] || ['#6b7280', '#f9fafb', status]
  return <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
}

export function Skeleton({ h = 60, r = 12, mb = 12 }) {
  return <div style={{ height: h, borderRadius: r, background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: mb }} />
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: 480 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '13px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '13px', background: danger ? '#e02424' : '#1a56db', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{danger ? 'Delete' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

export const shimmerKeyframes = `@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`
