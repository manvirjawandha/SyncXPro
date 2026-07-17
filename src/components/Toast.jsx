// src/components/Toast.jsx
import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, show }
}

export function Toasts({ toasts }) {
  const colors = { success: '#0e9f6e', error: '#e02424', info: '#1a56db', warn: '#e3a008' }
  return (
    <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, width: 'calc(100% - 32px)', maxWidth: 440, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: colors[t.type] || colors.info, color: 'white', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', animation: 'slideDown 0.3s ease' }}>
          {t.msg}
        </div>
      ))}
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
