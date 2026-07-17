// src/components/ScannedDoc.jsx
import { useState, useRef, useEffect } from 'react'

// Renders a cropped/filtered document using pure CSS positioning.
// No canvas pixel access, no SVG <image> — works everywhere, including
// strict CSP environments and Safari's stricter sandboxing rules.
export default function ScannedDoc({ src, corners, filterMode = 'color', brightness = 100, contrast = 100 }) {
  const wrapRef = useRef(null)
  const [imgSize, setImgSize] = useState(null)
  const [wrapWidth, setWrapWidth] = useState(300)

  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWrapWidth(el.getBoundingClientRect().width || 300)
    const ro = new ResizeObserver(e => setWrapWidth(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cssFilter = filterMode === 'bw'
    ? `brightness(${brightness}%) contrast(${contrast}%) grayscale(100%)`
    : filterMode === 'enhance'
    ? `brightness(${brightness}%) contrast(${Math.min(contrast + 20, 220)}%) saturate(140%)`
    : `brightness(${brightness}%) contrast(${contrast}%)`

  if (!src) return null
  if (!corners) return <img src={src} alt="doc" style={{ width: '100%', display: 'block', filter: cssFilter }} />
  if (!imgSize) return <div ref={wrapRef} style={{ width: '100%', minHeight: 180, background: '#e5e7eb' }} />

  const IW = imgSize.w, IH = imgSize.h
  const pts = corners.map(c => ({ x: c.x * IW, y: c.y * IH }))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const cropW = maxX - minX, cropH = maxY - minY
  const scale = wrapWidth / cropW

  return (
    <div ref={wrapRef} style={{ width: '100%', height: cropH * scale, overflow: 'hidden', position: 'relative' }}>
      <img src={src} alt="doc" style={{
        position: 'absolute', left: -minX * scale, top: -minY * scale,
        width: IW * scale, height: IH * scale, maxWidth: 'none', display: 'block', filter: cssFilter,
      }} />
    </div>
  )
}
