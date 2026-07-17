// src/components/CropEditor.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { S } from '../lib/constants'

export default function CropEditor({ imageSrc, onDone, onCancel }) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [bounds, setBounds] = useState({ x: 0, y: 0, w: 1, h: 1 })
  const [corners, setCorners] = useState([
    { x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 },
  ])
  const dragging = useRef(null)

  const updateBounds = () => {
    if (!imgRef.current || !containerRef.current) return
    const ir = imgRef.current.getBoundingClientRect()
    const cr = containerRef.current.getBoundingClientRect()
    setBounds({ x: ir.left - cr.left, y: ir.top - cr.top, w: ir.width, h: ir.height })
  }

  useEffect(() => {
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [])

  const toPixel = c => ({ x: bounds.x + c.x * bounds.w, y: bounds.y + c.y * bounds.h })
  const toRatio = (px, py) => ({
    x: Math.max(0, Math.min(1, (px - bounds.x) / bounds.w)),
    y: Math.max(0, Math.min(1, (py - bounds.y) / bounds.h)),
  })
  const getPos = e => {
    const t = e.touches ? e.touches[0] : e
    const cr = containerRef.current.getBoundingClientRect()
    return { px: t.clientX - cr.left, py: t.clientY - cr.top }
  }
  const onMove = useCallback(e => {
    if (dragging.current === null) return
    const { px, py } = getPos(e)
    setCorners(p => p.map((c, i) => i === dragging.current ? toRatio(px, py) : c))
  }, [bounds])

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
  const polyPts = corners.map(c => { const p = toPixel(c); return `${p.x},${p.y}` }).join(' ')

  return (
    <div ref={containerRef} style={{ position: 'relative', touchAction: 'none', userSelect: 'none' }}
      onMouseMove={onMove} onMouseUp={() => { dragging.current = null }}
      onTouchMove={onMove} onTouchEnd={() => { dragging.current = null }}>
      <img ref={imgRef} src={imageSrc} alt="crop"
        onLoad={() => { setReady(true); setTimeout(updateBounds, 50) }}
        style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      {ready && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <polygon points={polyPts} fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="7,3" />
        </svg>
      )}
      {ready && corners.map((c, i) => {
        const p = toPixel(c)
        return (
          <div key={i}
            onMouseDown={e => { e.preventDefault(); dragging.current = i }}
            onTouchStart={e => { e.preventDefault(); dragging.current = i }}
            style={{
              position: 'absolute', left: p.x - 22, top: p.y - 22, width: 44, height: 44, borderRadius: '50%',
              background: COLORS[i], border: '3px solid white', boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
              cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 10, fontWeight: 800, zIndex: 10, touchAction: 'none',
            }}>
            {['TL', 'TR', 'BR', 'BL'][i]}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={onCancel} style={S.btn('#6b7280')}>Retake</button>
        <button onClick={() => onDone(corners)} style={{ ...S.btn('#1a56db'), flex: 2 }}>✓ Confirm Crop</button>
      </div>
    </div>
  )
}
