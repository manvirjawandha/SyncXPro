// src/pages/DriverApp.jsx
const driverDesktopCss = `
  .dv-navlink:hover { color: #ffffff !important; }
  .dv-card { transition: transform 140ms ease, box-shadow 140ms ease; }
  .dv-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(15,23,42,0.10); }
`
import { useState, useEffect, useRef } from 'react'
import { S, DOC_TYPES, COUNTRIES, getDocType, formatMoney } from '../lib/constants'
import { Field, Skeleton } from '../components/Shared'
import ScannedDoc from '../components/ScannedDoc'
import CropEditor from '../components/CropEditor'
import { api } from '../lib/api'
import { compressImage, imageSizeMB, MAX_IMAGE_SIZE_MB } from '../lib/imageUtils'
import { isNative, isOnline, capturePhoto, pickPhoto, getPosition, scanDocumentPages } from '../lib/native'
import { useBreakpoints } from '../lib/useMediaQuery'
import { enqueue } from '../lib/offlineQueue'

// Apply filters to image and return new base64 with filters baked in
async function applyFiltersToImage(base64, corners, filterMode, brightness, contrast, rotation = 0) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        // Use naturalWidth/Height — img.width can read 0 if accessed before
        // layout, which silently yields a blank (0-size) canvas export.
        const iw = img.naturalWidth || img.width
        const ih = img.naturalHeight || img.height
        if (!iw || !ih) return reject(new Error('Image loaded with zero dimensions — please retake this page'))
        // Normalize img dimensions used below to the reliable values
        img.width = iw
        img.height = ih
        // Step 1: Extract bounding box from corners
        // corners is array: [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, ...]
        // where x,y are normalized 0-1 values (ratio of image dimensions)
        let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height
        
        if (corners && Array.isArray(corners) && corners.length > 0) {
          // Get all x and y coordinates
          const xs = corners.map(c => c?.x ?? 0).filter(x => typeof x === 'number')
          const ys = corners.map(c => c?.y ?? 0).filter(y => typeof y === 'number')
          
          if (xs.length > 0 && ys.length > 0) {
            const minX = Math.min(...xs)
            const maxX = Math.max(...xs)
            const minY = Math.min(...ys)
            const maxY = Math.max(...ys)
            
            // Convert from normalized (0-1) to pixel coordinates
            cropX = Math.max(0, Math.round(minX * img.width))
            cropY = Math.max(0, Math.round(minY * img.height))
            cropW = Math.max(1, Math.round((maxX - minX) * img.width))
            cropH = Math.max(1, Math.round((maxY - minY) * img.height))
            
            console.log('Cropping from corners:', { 
              minX, maxX, minY, maxY,
              imgW: img.width, imgH: img.height,
              cropX, cropY, cropW, cropH 
            })
          }
        }
        
        // Step 2: Create canvas with cropped size
        const canvas = document.createElement('canvas')
        canvas.width = cropW
        canvas.height = cropH
        const ctx = canvas.getContext('2d')
        
        // Step 3: Draw cropped portion of original image onto canvas
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
        
        // Step 4: Apply brightness and contrast
        if (brightness !== 100 || contrast !== 100) {
          ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`
          ctx.drawImage(canvas, 0, 0)
        }
        
        // Step 5: Apply B&W or Enhance filter to pixel data
        if (filterMode === 'bw' || filterMode === 'enhance') {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imgData.data
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const gray = r * 0.299 + g * 0.587 + b * 0.114
            
            if (filterMode === 'bw') {
              data[i] = data[i + 1] = data[i + 2] = gray
            } else if (filterMode === 'enhance') {
              // Enhance: boost contrast for better OCR
              let enhanced = gray
              if (gray < 100) enhanced = Math.max(0, gray * 0.7)
              else if (gray > 150) enhanced = Math.min(255, gray * 1.3)
              data[i] = data[i + 1] = data[i + 2] = enhanced
            }
          }
          ctx.putImageData(imgData, 0, 0)
        }
        
        // Step 5.5: Bake rotation into the image pixels
        let finalCanvas = canvas
        if (rotation && rotation % 360 !== 0) {
          const rot = ((rotation % 360) + 360) % 360
          const rc = document.createElement('canvas')
          if (rot === 90 || rot === 270) { rc.width = canvas.height; rc.height = canvas.width }
          else { rc.width = canvas.width; rc.height = canvas.height }
          const rctx = rc.getContext('2d')
          rctx.translate(rc.width / 2, rc.height / 2)
          rctx.rotate(rot * Math.PI / 180)
          rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
          finalCanvas = rc
          console.log(`✅ Rotation ${rot}° baked into image`)
        }

        // Step 6: Convert to JPEG base64
        const result = finalCanvas.toDataURL('image/jpeg', 0.95)
        // Guard against a canvas that produced an empty/blank export.
        // A valid JPEG data URL is well over a few hundred chars; a blank
        // or failed export comes back tiny (or as the 5-char "data:,").
        if (!result || !result.startsWith('data:image/jpeg') || result.length < 1000) {
          return reject(new Error('Image export produced an empty result — please retake this page'))
        }
        console.log('✅ Cropped+filtered image created:', (result.length / 1024).toFixed(1), 'KB')
        resolve(result)
      } catch (e) {
        console.error('❌ Crop/filter error:', e.message)
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = base64
  })
}

export default function DriverApp({ user, onLogout, toast }) {
  const { isTablet } = useBreakpoints()
  const [page, setPage] = useState('list')
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewDoc, setViewDoc] = useState(null)

  // Scan flow state
  const [docType, setDocType] = useState(null)
  const [docNumber, setDocNumber] = useState('')
  const [gpsLocation, setGpsLocation] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [rawImage, setRawImage] = useState(null)
  const [imageWarning, setImageWarning] = useState('')
  const [cropData, setCropData] = useState(null)

  // Multi-page state
  const [pages, setPages] = useState([]) // [{src, corners, filterMode, brightness, contrast}]
  const [editingPageIndex, setEditingPageIndex] = useState(null) // which page we're editing

  const [submitting, setSubmitting] = useState(false)

  // Pay settlements uploaded by the office for this driver.
  const [settlements, setSettlements] = useState([])
  const [viewSettlement, setViewSettlement] = useState(null)

  // Documents the admin has asked this driver for.
  const [requests, setRequests] = useState([])
  const [activeRequest, setActiveRequest] = useState(null) // the request being fulfilled, if any

  useEffect(() => { loadDocs(); loadRequests(); loadSettlements() }, [])

  const loadDocs = async () => {
    setLoading(true)
    try {
      const data = await api.getMyDocuments()
      setDocs(data.documents || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  // Quiet on failure: a driver with no signal shouldn't get an error toast just
  // for opening the app. The list simply stays empty until it can load.
  const loadRequests = async () => {
    try {
      const data = await api.getMyDocRequests()
      setRequests(data.requests || [])
    } catch { /* ignore */ }
  }

  // Quiet on failure for the same reason as requests.
  const loadSettlements = async () => {
    try {
      const data = await api.getMySettlements()
      setSettlements(data.settlements || [])
    } catch { /* ignore */ }
  }

  // Open the capture flow already filled in from an admin request. The driver
  // lands on the details step: number is done, they add location and scan.
  const startFromRequest = (req) => {
    setActiveRequest(req)
    setDocType(req.docType)
    setDocNumber(req.docNumber || '')
    setGpsLocation(null)
    setPages([])
    setPage('details')
  }

  // Reverse-geocode on the device, in real time, right when the driver taps
  // capture. Uses BigDataCloud's free client-side endpoint (no API key). This
  // MUST run client-side on the user's own current coordinates — never server-side
  // on stored coordinates — per their fair-use policy.
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
      const res = await fetch(url)
      if (!res.ok) return null
      const d = await res.json()
      const city = d.city || d.locality || d.principalSubdivision || ''
      const state = d.principalSubdivision || ''
      const country = d.countryCode || ''
      // Build a clean "City, State" (or best available) label
      let label = ''
      if (city && state && city !== state) label = `${city}, ${state}`
      else label = city || state || ''
      if (label && country && country !== 'US') label += `, ${country}`
      return { city, state, country, label: label || null }
    } catch { return null }
  }

  const captureGPS = async () => {
    setGpsLoading(true)
    try {
      // On a device this uses the native Geolocation plugin (and handles the
      // Android runtime permission prompt). On the web it falls back to
      // navigator.geolocation exactly as before.
      const position = await getPosition()
      const { latitude, longitude, accuracy } = position.coords
      // Store coordinates immediately so capture never fails on geocoding
      setGpsLocation({ latitude, longitude, accuracy })
      toast(`✓ Location captured (±${Math.round(accuracy)}m)`, 'success')
      // Then resolve to a readable place name (best-effort, non-blocking)
      const place = await reverseGeocode(latitude, longitude)
      if (place && place.label) {
        setGpsLocation({ latitude, longitude, accuracy, ...place })
      }
    } catch (e) {
      toast('Could not get location - GPS may be disabled', 'error')
    }
    setGpsLoading(false)
  }

  // Shared by both capture paths: the web file input and the native camera
  // plugin both end up here with a data URL.
  const ingestImage = async (dataUrl) => {
    if (!dataUrl) return
    let data = dataUrl
    if (imageSizeMB(data) > MAX_IMAGE_SIZE_MB) {
      setImageWarning(`Image compressed`)
      data = await compressImage(data, 1400, 0.85)
    } else { setImageWarning('') }
    setRawImage(data)
    setPage('crop')
  }

  const handleFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => { ingestImage(ev.target.result) }
    reader.readAsDataURL(file)
  }

  // On a device, take over the label click. The camera button launches the
  // native document scanner (ML Kit on Android, VisionKit on iOS): automatic
  // edge detection, multi-page in one session, pages come back already cropped
  // and enhanced — so they skip our manual crop/filter steps entirely.
  // Gallery still uses the photo picker + manual crop (existing photos vary).
  // On the web we return immediately and the <label for> opens the file input.
  const handleNativeCapture = async (e, source) => {
    if (!isNative()) return
    e.preventDefault()

    if (source === 'camera') {
      const budget = 20 - pages.length
      if (budget <= 0) { toast('Maximum 20 pages per document', 'error'); return }
      try {
        const scanned = await scanDocumentPages(budget)
        if (!scanned.length) return // driver backed out — no nagging
        const newPages = []
        for (let dataUrl of scanned) {
          if (imageSizeMB(dataUrl) > MAX_IMAGE_SIZE_MB) dataUrl = await compressImage(dataUrl, 1400, 0.85)
          // Scanner output is already cropped/corrected, so neutral params:
          // render exactly as captured.
          newPages.push({ src: dataUrl, corners: null, filterMode: 'color', brightness: 100, contrast: 100 })
        }
        setPages(prev => [...prev, ...newPages])
        setEditingPageIndex(null)
        setPage('pages')
        toast(`✓ ${newPages.length} page${newPages.length > 1 ? 's' : ''} scanned`, 'success')
        return
      } catch (err) {
        // ML Kit refuses emulators; module may still be downloading on a fresh
        // install. Fall back to the plain camera + manual crop — never strand
        // the driver at the dock.
        console.warn('Document scanner unavailable, falling back to camera:', err?.message)
      }
    }

    try {
      const dataUrl = source === 'camera' ? await capturePhoto() : await pickPhoto()
      await ingestImage(dataUrl)
    } catch (err) {
      // The plugin throws on user-cancel too — don't nag about that.
      if (!/cancel/i.test(String(err?.message || ''))) {
        toast(source === 'camera' ? 'Could not open the camera' : 'Could not open photos', 'error')
      }
    }
  }

  const handleCropDone = (corners) => {
    setCropData({ src: rawImage, corners })
    setPage('edit-page')
  }

  const handlePageSave = (editData) => {
    // editData = { src, corners, filterMode, brightness, contrast }
    if (editingPageIndex !== null) {
      // Replacing an existing page
      setPages(prev => prev.map((p, i) => i === editingPageIndex ? editData : p))
      setEditingPageIndex(null)
    } else {
      // Adding a new page
      setPages(prev => [...prev, editData])
    }
    setCropData(null)
    setRawImage(null)
    setPage('pages')
  }

  const handleAddAnotherPage = () => {
    setPage('scan')
  }

  const handleDeletePage = (i) => {
    setPages(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleRetakePage = (i) => {
    setEditingPageIndex(i)
    setPage('scan')
  }

  const handleSubmit = async () => {
    if (!pages.length) { toast('Add at least one page', 'error'); return }
    setSubmitting(true)
    try {
      // Dead zones are normal in this job. On a device, if there's no signal we
      // save the whole submission to the phone and upload it automatically the
      // moment signal returns — the driver walks away and it just happens.
      if (isNative() && !(await isOnline())) {
        await enqueue({ docType, docNumber: docNumber.trim(), gpsLocation, pages, requestId: activeRequest?.id || null })
        toast('📥 Saved. It will upload automatically when you have signal.', 'info')
        resetFlow()
        setSubmitting(false)
        return
      }

      const data = await api.submitDocument({ docType, docNumber: docNumber.trim(), gpsLocation, pages, requestId: activeRequest?.id || null })
      if (data.pdfError || data.pdfGenerated === false) {
        toast(`⚠ Submitted, but the PDF didn't generate. Please retake the pages and resubmit.`, 'warning')
      } else if (data.emailSent) {
        toast(`✓ Submitted! PDF emailed to admin`, 'success')
      } else if (data.emailError) {
        toast(`✓ Document submitted, but email failed: ${data.emailError}`, 'warning')
      } else {
        toast(`✓ Document submitted`, 'success')
      }
      resetFlow()
      await Promise.all([loadDocs(), loadRequests()])
    } catch (e) {
      // Signal can die mid-upload — that's a network failure, not a bad scan.
      // Queue it rather than making the driver photograph everything again.
      // Real server rejections (validation, auth) still surface as errors.
      const msg = String(e?.message || '')
      if (isNative() && /failed to fetch|network|timed? out|load failed/i.test(msg)) {
        try {
          await enqueue({ docType, docNumber: docNumber.trim(), gpsLocation, pages, requestId: activeRequest?.id || null })
          toast('📥 Lost signal — saved. It will upload automatically.', 'info')
          resetFlow()
          setSubmitting(false)
          return
        } catch { /* fall through to the error toast below */ }
      }
      toast(msg || 'Could not submit', 'error')
    }
    setSubmitting(false)
  }

  const resetFlow = () => {
    setActiveRequest(null)
    setDocType(null); setDocNumber(''); setGpsLocation(null)
    setRawImage(null); setCropData(null); setPages([]); setEditingPageIndex(null)
    setImageWarning('')
    setPage('list')
  }

  const STEPS = ['type', 'details', 'scan', 'crop', 'edit-page', 'pages']
  const SCAN_PAGES = STEPS
  // Bottom-tab destinations: same header, no back arrow.
  const HOME_PAGES = ['list', 'pay']
  const stepIdx = STEPS.indexOf(page)
  const PAGE_TITLES = {
    list: `Hi, ${user.name}`, pay: `Hi, ${user.name}`, type: 'Document Type', details: 'Document Details',
    scan: pages.length > 0 ? `Add Page ${pages.length + 1}` : 'Capture Page 1',
    crop: 'Adjust Crop', 'edit-page': `Edit Page`, pages: 'Review Pages',
  }

  const goBack = () => {
    if (page === 'pay') { setPage('list'); return }
    if (page === 'type') resetFlow()
    // When filling an admin request the type is fixed, so there's no type step
    // to go back to — back means abandoning the request for now.
    else if (page === 'details') { if (activeRequest) resetFlow(); else setPage('type') }
    else if (page === 'scan') { setEditingPageIndex(null); setPage(pages.length > 0 ? 'pages' : 'details') }
    else if (page === 'crop') setPage('scan')
    else if (page === 'edit-page') setPage('crop')
    else if (page === 'pages') { if (pages.length === 0) setPage('details'); else setPage('pages') }
  }

  if (viewSettlement) return (
    <SettlementDetail settlement={viewSettlement} toast={toast}
      onBack={() => { setViewSettlement(null); loadSettlements() }}
      onUpdated={(sett) => { setViewSettlement(sett); loadSettlements() }} />
  )

  if (viewDoc) return <DriverDocDetail doc={viewDoc} onBack={() => { setViewDoc(null); loadDocs() }} />

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', maxWidth:isTablet?'none':600, margin:'0 auto', fontFamily:'system-ui,sans-serif' }}>
      <style>{driverDesktopCss}</style>
      <input id="inp-camera" type="file" accept="image/*" capture="environment" onChange={handleFile}
        style={{ position:'fixed', left:-9999, width:1, height:1, opacity:0 }} />
      <input id="inp-gallery" type="file" accept="image/*" onChange={handleFile}
        style={{ position:'fixed', left:-9999, width:1, height:1, opacity:0 }} />

      {/* ── Desktop: full-width site header ── */}
      {isTablet && (
        <header style={{ background:'#0f172a', position:'sticky', top:0, zIndex:20, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 32px', height:60, display:'flex', alignItems:'center', gap:24 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:10, flexShrink:0 }}>
              <span style={{ fontSize:19, fontWeight:800, color:'white', letterSpacing:-0.3 }}>SyncX Pro</span>
              <span style={{ fontSize:14, color:'rgba(255,255,255,0.45)' }}>{user.companyName}</span>
            </div>

            <nav style={{ display:'flex', gap:4, alignSelf:'stretch', flex:1 }}>
              <button onClick={() => { resetFlow() }} className="dv-navlink" style={{
                background:'transparent', border:'none', cursor:'pointer', padding:'0 16px', fontSize:14, fontWeight:600,
                color: page === 'list' ? 'white' : 'rgba(255,255,255,0.5)',
                borderBottom:`2px solid ${page === 'list' ? '#3b82f6' : 'transparent'}`,
              }}>
                My documents
              </button>
              <button onClick={() => { resetFlow(); setPage('type') }} className="dv-navlink" style={{
                background:'transparent', border:'none', cursor:'pointer', padding:'0 16px', fontSize:14, fontWeight:600,
                color: SCAN_PAGES.includes(page) ? 'white' : 'rgba(255,255,255,0.5)',
                borderBottom:`2px solid ${SCAN_PAGES.includes(page) ? '#3b82f6' : 'transparent'}`,
              }}>
                Scan document{requests.length > 0 ? ` (${requests.length})` : ''}
              </button>
              <button onClick={() => { resetFlow(); setPage('pay') }} className="dv-navlink" style={{
                background:'transparent', border:'none', cursor:'pointer', padding:'0 16px', fontSize:14, fontWeight:600,
                color: page === 'pay' ? 'white' : 'rgba(255,255,255,0.5)',
                borderBottom:`2px solid ${page === 'pay' ? '#3b82f6' : 'transparent'}`,
              }}>
                My pay{settlements.some(x => x.status === 'queried') ? ' •' : ''}
              </button>
            </nav>

            <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{user.name}</span>
              <button onClick={onLogout} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.7)', borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>Sign out</button>
            </div>
          </div>
        </header>
      )}

      {/* ── Mobile: the original app header ── */}
      {!isTablet && (
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'20px 16px 0', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {!HOME_PAGES.includes(page) && <button onClick={goBack} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', borderRadius:10, padding:'7px 13px', cursor:'pointer', fontSize:16 }}>←</button>}
            <div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>{user.companyName}</div>
              <div style={{ fontSize:17, fontWeight:800, color:'white' }}>{PAGE_TITLES[page] || 'SyncX Pro'}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.6)', borderRadius:10, padding:'7px 14px', cursor:'pointer', fontSize:13, fontWeight:600, flexShrink:0 }}>Sign Out</button>
        </div>
        {stepIdx !== -1 && <div style={{ display:'flex', gap:4, paddingBottom:14 }}>
          {STEPS.map((s, i) => <div key={s} style={{ flex:1, height:3, borderRadius:99, background:i<=stepIdx?'#3b82f6':'rgba(255,255,255,0.2)' }} />)}
        </div>}
        {HOME_PAGES.includes(page) && <div style={{ height:14 }} />}
      </div>
      )}

      {/* Mobile: bottom tabs. Pay is its own destination, not a card buried in
          the documents list. Hidden during the scan flow to keep it focused. */}
      {!isTablet && (page === 'list' || page === 'pay') && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:30, display:'flex',
          background:'white', borderTop:'1px solid #e5e7eb',
          paddingBottom:'env(safe-area-inset-bottom)',
          boxShadow:'0 -2px 12px rgba(0,0,0,0.06)',
        }}>
          {[['list','📄','Documents'],['pay','💵','My Pay']].map(([id, icon, label]) => {
            const on = page === id
            const dot = id === 'pay' && settlements.some(x => x.status === 'queried')
            return (
              <button key={id} onClick={() => setPage(id)} style={{
                flex:1, background:'transparent', border:'none', cursor:'pointer',
                padding:'10px 0 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                color: on ? '#1a56db' : '#9ca3af', fontSize:11, fontWeight:700,
                borderTop:`2px solid ${on ? '#1a56db' : 'transparent'}`, marginTop:-1,
              }}>
                <span style={{ fontSize:19, position:'relative' }}>
                  {icon}
                  {dot && <span style={{ position:'absolute', top:-1, right:-5, width:7, height:7, borderRadius:7, background:'#e02424' }} />}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Content. The list gets the full width; the capture wizard stays a
          focused column — a scan flow stretched across a monitor reads badly. */}
      <div style={ isTablet
        ? { maxWidth: page === 'list' ? 1100 : 780, margin:'0 auto', padding:'28px 32px 60px' }
        : S.page }>

        {/* Desktop-only step header, since there's no mobile back bar up top */}
        {isTablet && SCAN_PAGES.includes(page) && (
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
            <button onClick={goBack} style={{ background:'white', border:'1px solid #e5e7eb', color:'#374151', borderRadius:10, padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:700 }}>← Back</button>
            <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>{PAGE_TITLES[page] || 'Scan'}</h1>
            {stepIdx !== -1 && (
              <div style={{ display:'flex', gap:4, flex:1, maxWidth:280, marginLeft:'auto' }}>
                {STEPS.map((s, i) => <div key={s} style={{ flex:1, height:3, borderRadius:99, background:i<=stepIdx?'#3b82f6':'#e5e7eb' }} />)}
              </div>
            )}
          </div>
        )}

        {/* LIST */}
        {page === 'list' && <>
          {requests.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:800, color:'#92400e', marginBottom:8, letterSpacing:0.5, textTransform:'uppercase' }}>
                📨 Requested from you
              </div>
              {requests.map(r => {
                const dt = getDocType(r.docType)
                return (
                  <div key={r.id} onClick={() => startFromRequest(r)} style={{
                    background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:14, padding:'14px 16px',
                    marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:12,
                  }}>
                    <div style={{ width:4, alignSelf:'stretch', borderRadius:4, background:dt.color, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>{dt.icon} {dt.label}</div>
                      {r.docNumber && <div style={{ fontFamily:'monospace', fontSize:13, color:'#4b5563', marginTop:2 }}>{r.docNumber}</div>}
                      {r.note && <div style={{ fontSize:12, color:'#92400e', marginTop:4, lineHeight:1.5 }}>{r.note}</div>}
                    </div>
                    <div style={{ background:'#1a56db', color:'white', borderRadius:9, padding:'8px 12px', fontSize:13, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                      Scan →
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1, background:'white', borderRadius:14, padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:24, fontWeight:800, color:'#1a56db' }}>{docs.length}</div>
              <div style={{ fontSize:13, color:'#6b7280', fontWeight:600 }}>Document{docs.length!==1?'s':''} Submitted</div>
            </div>
            {/* Desktop: compact button in the header row — a full-width bar across
                a wide page reads as "mobile stretched onto desktop". */}
            {isTablet && docs.length > 0 && (
              <button onClick={() => setPage('type')} style={S.btn('#1a56db', { width:'auto', padding:'13px 22px', flex:'none' })}>+ Scan / Upload Document</button>
            )}
          </div>

          {/* Mobile: full-width action pinned above the list so it never drifts
              down the page as documents accumulate. */}
          {!isTablet && docs.length > 0 && <button onClick={() => setPage('type')} style={{ ...S.btn('#1a56db'), width:'100%', marginBottom:14 }}>+ Scan / Upload Document</button>}

          {loading ? [1,2,3].map(i => <Skeleton key={i} h={80} />) :
           docs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'50px 20px', color:'#9ca3af' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📂</div>
              <div style={{ fontWeight:700, color:'#374151', fontSize:17 }}>No documents yet</div>
              <div style={{ fontSize:13, marginTop:6, marginBottom:24 }}>Scan your first document to get started</div>
              <button onClick={() => setPage('type')} style={S.btn('#1a56db', { width:'auto', padding:'13px 28px', flex:'none' })}>+ Scan Document</button>
            </div>
           ) : (
           <div style={{ display:'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr', gap: isTablet ? 12 : 0 }}>
           {docs.map(doc => {
            const dt = getDocType(doc.docType)
            return (
              <div key={doc.id} onClick={() => setViewDoc(doc)} className="dv-card" style={{ background:'white', borderRadius:16, marginBottom:isTablet?0:10, overflow:'hidden', display:'flex', alignItems:'stretch', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', cursor:'pointer' }}>
                <div style={{ width:5, background:dt.color, flexShrink:0 }} />
                <div style={{ width:66, flexShrink:0, overflow:'hidden', background:'#f9fafb', display:'flex', alignItems:'center' }}>
                  <ScannedDoc src={doc.src} corners={doc.corners} filterMode={doc.filterMode} brightness={doc.brightness} contrast={doc.contrast} />
                </div>
                <div style={{ flex:1, padding:'10px 12px', minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                    <div style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dt.icon} {dt.label}</div>
                  </div>
                  <div style={{ fontFamily:'monospace', fontSize:12, color:'#6b7280', marginTop:3 }}>{doc.docNumber || 'No number'}</div>
                  <div style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>
                    {doc.pageCount > 1 && <span style={{ background:'#eff6ff', color:'#1a56db', borderRadius:6, padding:'1px 6px', fontWeight:700, marginRight:6 }}>{doc.pageCount}p</span>}
                    {new Date(doc.submittedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                  </div>
                </div>
                <div style={{ padding:'0 12px', display:'flex', alignItems:'center', color:'#d1d5db', fontSize:20 }}>›</div>
              </div>
            )
          })}
          </div>
          )}
        </>}

        {/* STEP 1: TYPE */}
        {page === 'type' && <>
          <div style={{ fontSize:13, color:'#6b7280', marginBottom:12, fontWeight:500 }}>Select document type</div>
          <div style={{ display:'flex', flexDirection:'column', background:'white', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            {DOC_TYPES.map((d, i) => (
              <button key={d.id} onClick={() => { setDocType(d.id); setPage('details') }} style={{
                display:'flex', alignItems:'center', gap:14, padding:'16px 18px',
                background:docType===d.id?'#eff6ff':'white', border:'none',
                borderBottom:i<DOC_TYPES.length-1?'1px solid #f3f4f6':'none',
                cursor:'pointer', textAlign:'left', width:'100%',
              }}>
                <div style={{ width:38, height:38, borderRadius:10, background:docType===d.id?d.color+'22':'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{d.icon}</div>
                <div style={{ fontSize:15, fontWeight:600, color:docType===d.id?d.color:'#111827', flex:1 }}>{d.label}</div>
                {docType===d.id ? <div style={{ width:22, height:22, borderRadius:'50%', background:d.color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:800 }}>✓</div> : <div style={{ color:'#d1d5db', fontSize:18 }}>›</div>}
              </button>
            ))}
          </div>
        </>}

        {/* MY PAY — settlements from the office */}
        {page === 'pay' && <>
          {isTablet && <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:'0 0 20px' }}>My pay</h1>}
          {settlements.length === 0 ? (
            <div style={{ textAlign:'center', padding:'50px 20px', color:'#9ca3af' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>💵</div>
              <div style={{ fontWeight:700, color:'#374151', fontSize:16 }}>No settlements yet</div>
              <div style={{ fontSize:13, marginTop:6, lineHeight:1.6 }}>When your office uploads a pay settlement,<br />it appears here with the PDF attached.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:isTablet?'1fr 1fr':'1fr', gap:isTablet?12:0 }}>
              {settlements.map(st => (
                <div key={st.id} onClick={() => setViewSettlement(st)} className="dv-card" style={{
                  background:'white', borderRadius:16, marginBottom:isTablet?0:10, padding:'14px 16px',
                  boxShadow:'0 2px 8px rgba(0,0,0,0.07)', cursor:'pointer',
                  display:'flex', alignItems:'center', gap:12,
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:17, fontWeight:800, color:'#0f172a' }}>{fmtMoney(st.amount, st.currency)}</div>
                    <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>
                      {fmtDate(st.periodStart)} – {fmtDate(st.periodEnd)} · deposited {fmtDate(st.depositDate)}
                    </div>
                    {st.comments?.length > 0 && (
                      <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>💬 {st.comments.length} message{st.comments.length!==1?'s':''}</div>
                    )}
                  </div>
                  <SettStatusBadge status={st.status} />
                  <span style={{ color:'#d1d5db', fontSize:18 }}>›</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* STEP 2: DETAILS - SIMPLIFIED */}
        {page === 'details' && <>
          {activeRequest && (
            <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:14, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:'#92400e', letterSpacing:0.5, textTransform:'uppercase', marginBottom:4 }}>
                📨 Filling a request from your office
              </div>
              <div style={{ fontSize:13, color:'#78350f', lineHeight:1.5 }}>
                {getDocType(activeRequest.docType).label}{activeRequest.docNumber ? ` · ${activeRequest.docNumber}` : ''} — the details below are filled in already.
                {activeRequest.note ? ` "${activeRequest.note}"` : ''}
              </div>
            </div>
          )}

          <div style={S.card({ marginBottom:14 })}>
            <Field label="Document Number">
              <input style={{ ...S.input, fontFamily:'monospace', letterSpacing:1, textTransform:'uppercase' }}
                value={docNumber} onChange={e => setDocNumber(e.target.value.toUpperCase())} placeholder="e.g. A12345678" />
            </Field>
          </div>
          
          <div style={S.card({ marginBottom:14, background:gpsLocation?'#f0fdf4':'#fef3c7', border:gpsLocation?'1px solid #86efac':'1px solid #fcd34d' })}>
            <div style={{ fontSize:13, fontWeight:700, color:gpsLocation?'#166534':'#92400e', marginBottom:12 }}>
              {gpsLocation ? '✓ Location Captured' : '📍 Capture Location'}
            </div>
            {gpsLocation && (
              <div style={{ marginBottom:12 }}>
                {gpsLocation.label && (
                  <div style={{ fontSize:15, fontWeight:700, color:'#166534', marginBottom:4 }}>
                    📍 {gpsLocation.label}
                  </div>
                )}
                <div style={{ fontSize:11, color:'#6b7280', fontFamily:'monospace' }}>
                  {gpsLocation.latitude.toFixed(5)}, {gpsLocation.longitude.toFixed(5)} · ±{Math.round(gpsLocation.accuracy)}m
                </div>
              </div>
            )}
            <button onClick={captureGPS} disabled={gpsLoading} style={{ ...S.btn(gpsLocation?'#0e9f6e':'#1a56db'), width:'100%', fontSize:14 }}>
              {gpsLoading ? '⏳ Getting location...' : gpsLocation ? '↻ Recapture Location' : '📍 Capture My Location'}
            </button>
          </div>

          <button onClick={() => setPage('scan')} style={{ ...S.btn('#1a56db'), width:'100%' }}>Next: Capture Page 1 →</button>
        </>}

        {/* STEP 3: SCAN */}
        {page === 'scan' && <>
          {pages.length > 0 && (
            <div style={{ background:'#eff6ff', borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18 }}>📄</span>
              <div style={{ fontSize:13, color:'#1e40af', fontWeight:600 }}>{pages.length} page{pages.length>1?'s':''} added — capturing page {editingPageIndex !== null ? editingPageIndex+1 : pages.length+1}</div>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <label htmlFor="inp-camera" onClick={e => handleNativeCapture(e, 'camera')} style={{ background:'white', border:'2px dashed #3b82f6', borderRadius:18, padding:'32px 20px', cursor:'pointer', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'block' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>📷</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#1a56db', marginBottom:4 }}>Take Photo</div>
              <div style={{ fontSize:13, color:'#9ca3af' }}>Open camera to capture page</div>
            </label>
            <label htmlFor="inp-gallery" onClick={e => handleNativeCapture(e, 'gallery')} style={{ background:'white', border:'2px dashed #0e9f6e', borderRadius:18, padding:'32px 20px', cursor:'pointer', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'block' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>🖼️</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#0e9f6e', marginBottom:4 }}>Upload from Gallery</div>
              <div style={{ fontSize:13, color:'#9ca3af' }}>Choose from photos</div>
            </label>
          </div>
        </>}

        {/* STEP 4: CROP */}
        {page === 'crop' && rawImage && <>
          {imageWarning && <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#92400e', fontWeight:600 }}>⚡ {imageWarning}</div>}
          <div style={{ background:'#0f172a', borderRadius:14, padding:14 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'center', marginBottom:10 }}>Drag corner handles to align with document edges</div>
            <CropEditor imageSrc={rawImage} onDone={handleCropDone} onCancel={() => setPage('scan')} />
          </div>
        </>}

        {/* STEP 5: EDIT PAGE */}
        {page === 'edit-page' && cropData && (
          <PageEditor cropData={cropData} onSave={handlePageSave} onBack={() => setPage('crop')}
            pageNumber={editingPageIndex !== null ? editingPageIndex+1 : pages.length+1} toast={toast} />
        )}

        {/* STEP 6: PAGES REVIEW */}
        {page === 'pages' && <>
          <div style={{ fontSize:13, color:'#6b7280', marginBottom:12, fontWeight:500 }}>
            {pages.length} page{pages.length!==1?'s':''} — review before submitting
          </div>

          {pages.map((p, i) => (
            <div key={i} style={{ background:'white', borderRadius:16, marginBottom:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
              <div style={{ display:'flex', alignItems:'center', padding:'10px 14px', borderBottom:'1px solid #f3f4f6' }}>
                <div style={{ fontWeight:700, color:'#111827', fontSize:14, flex:1 }}>Page {i+1}</div>
                <button onClick={() => handleRetakePage(i)} style={{ background:'#eff6ff', color:'#1a56db', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', marginRight:8 }}>
                  Retake
                </button>
                <button onClick={() => handleDeletePage(i)} style={{ background:'#fff5f5', color:'#e02424', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  Delete
                </button>
              </div>
              <div style={{ background:'#64748b', padding:10 }}>
                <div style={{ background:'white', borderRadius:4, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.3)' }}>
                  <ScannedDoc src={p.src} corners={p.corners} filterMode={p.filterMode} brightness={p.brightness} contrast={p.contrast} />
                </div>
              </div>
            </div>
          ))}

          {/* Add more pages */}
          <button onClick={handleAddAnotherPage} style={{
            width:'100%', padding:'14px', background:'white', border:'2px dashed #d1d5db',
            borderRadius:14, cursor:'pointer', fontSize:14, fontWeight:700, color:'#6b7280',
            marginBottom:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            <span style={{ fontSize:20 }}>+</span> Add Another Page
          </button>

          {/* PDF notice */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', gap:10 }}>
            <span style={{ fontSize:18 }}>📄</span>
            <div style={{ fontSize:13, color:'#166534', lineHeight:1.5 }}>
              All {pages.length} page{pages.length!==1?'s':''} will be combined into a <strong>single PDF</strong> and emailed to your admin automatically.
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={submitting} style={{ ...S.btn('#1a56db'), width:'100%', opacity:submitting?0.7:1, fontSize:16 }}>
            {submitting ? 'Generating PDF & Submitting…' : `📤 Submit ${pages.length} Page${pages.length!==1?'s':''} to Admin`}
          </button>
        </>}

      </div>
    </div>
  )
}

// ── Per-page editor ───────────────────────────────────────────────────────────
function PageEditor({ cropData, onSave, onBack, pageNumber, toast }) {
  const [mode, setMode] = useState('color')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [saving, setSaving] = useState(false)
  const { src, corners } = cropData
  const FILTERS = [{ id:'color', label:'Color', icon:'🎨' }, { id:'bw', label:'B&W', icon:'⬛' }, { id:'enhance', label:'Enhance', icon:'✨' }]

  const handleSave = async () => {
    setSaving(true)
    try {
      console.log('Saving page with:', { src: src.substring(0, 50) + '...', corners, filterMode: mode, brightness, contrast, rotation })
      // Apply filters, crop AND rotation to get the final base64
      const filteredSrc = await applyFiltersToImage(src, corners, mode, brightness, contrast, rotation)
      console.log('Page saved, new src length:', filteredSrc.length)
      // Everything is baked into the pixels now — store neutral display params
      // so viewers show the image exactly as saved (no double crop/filter/rotate)
      onSave({ src: filteredSrc, corners: null, filterMode: 'color', brightness: 100, contrast: 100, rotation })
    } catch (e) {
      console.error('Filter/crop failed:', e.message)
      toast(`Error processing image: ${e.message}`, 'error')
      // Don't save on error - let user try again
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ background:'#64748b', padding:14, borderRadius:14, marginBottom:14 }}>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', textAlign:'center', marginBottom:8, fontWeight:600 }}>PAGE {pageNumber}</div>
        <div style={{ background:'white', borderRadius:3, overflow:'hidden', boxShadow:'0 6px 24px rgba(0,0,0,0.35)', transform:`rotate(${rotation}deg)`, transformOrigin:'center' }}>
          <ScannedDoc src={src} corners={corners} filterMode={mode} brightness={brightness} contrast={contrast} />
        </div>
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setMode(f.id)} disabled={saving} style={{ flex:1, padding:'10px 6px', borderRadius:12, cursor:'pointer', border:`2px solid ${mode===f.id?'#1a56db':'#e5e7eb'}`, background:mode===f.id?'#eff6ff':'white', color:mode===f.id?'#1a56db':'#374151', fontSize:13, fontWeight:700, opacity:saving?0.5:1 }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* ROTATION CONTROLS */}
      <div style={{ ...S.card(), marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:10 }}>Rotate: {rotation}°</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
          {[0, 90, 180, 270].map(angle => (
            <button key={angle} onClick={() => setRotation(angle)} disabled={saving}
              style={{ padding:'10px', borderRadius:10, cursor:'pointer', border:`2px solid ${rotation===angle?'#1a56db':'#e5e7eb'}`, background:rotation===angle?'#eff6ff':'white', color:rotation===angle?'#1a56db':'#374151', fontSize:13, fontWeight:700, opacity:saving?0.5:1 }}>
              {angle}°
            </button>
          ))}
        </div>
      </div>
      <div style={{ ...S.card(), marginBottom:14 }}>
        {[['Brightness', brightness, setBrightness, 50, 150], ['Contrast', contrast, setContrast, 50, 200]].map(([l, v, s, mn, mx]) => (
          <div key={l} style={{ marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:5 }}>{l}: {v}%</div>
            <input type="range" min={mn} max={mx} value={v} onChange={e => s(+e.target.value)} disabled={saving} style={{ width:'100%', accentColor:'#1a56db', opacity:saving?0.5:1 }} />
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onBack} disabled={saving} style={{ ...S.btn('#6b7280'), opacity:saving?0.5:1 }}>← Recrop</button>
        <button onClick={handleSave} disabled={saving}
          style={{ ...S.btn('#1a56db'), flex:2, opacity:saving?0.7:1 }}>
          {saving ? '⏳ Applying filters…' : `✓ Save Page ${pageNumber}`}
        </button>
      </div>
    </div>
  )
}

// ── Driver doc detail view ────────────────────────────────────────────────────
function DriverDocDetail({ doc, onBack }) {
  const { isTablet } = useBreakpoints()
  const dt = getDocType(doc.docType)
  const [viewingPage, setViewingPage] = useState(0)
  const allPages = doc.pages?.length > 0 ? doc.pages : [{ src:doc.src, corners:doc.corners, filterMode:doc.filterMode, brightness:doc.brightness, contrast:doc.contrast }]

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', maxWidth:isTablet?820:600, margin:'0 auto', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'20px 16px 18px', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', borderRadius:10, padding:'7px 13px', cursor:'pointer', fontSize:16 }}>←</button>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>Document · {allPages.length} page{allPages.length!==1?'s':''}</div>
            <div style={{ fontSize:17, fontWeight:700, color:'white' }}>{dt.icon} {dt.label}</div>
          </div>
        </div>
      </div>
      <div style={S.page}>
        {/* Page viewer */}
        <div style={{ background:'#64748b', padding:14, borderRadius:14, marginBottom:16 }}>
          {allPages.length > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <button onClick={() => setViewingPage(p => Math.max(0, p-1))} disabled={viewingPage===0}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:8, padding:'6px 14px', cursor:'pointer', opacity:viewingPage===0?.4:1 }}>‹</button>
              <span style={{ color:'white', fontSize:13, fontWeight:600 }}>Page {viewingPage+1} of {allPages.length}</span>
              <button onClick={() => setViewingPage(p => Math.min(allPages.length-1, p+1))} disabled={viewingPage===allPages.length-1}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:8, padding:'6px 14px', cursor:'pointer', opacity:viewingPage===allPages.length-1?.4:1 }}>›</button>
            </div>
          )}
          <div style={{ background:'white', borderRadius:3, overflow:'hidden', boxShadow:'0 6px 24px rgba(0,0,0,0.35)' }}>
            <ScannedDoc src={allPages[viewingPage]?.src} corners={allPages[viewingPage]?.corners}
              filterMode={allPages[viewingPage]?.filterMode} brightness={allPages[viewingPage]?.brightness}
              contrast={allPages[viewingPage]?.contrast} />
          </div>
          {/* Page thumbnails */}
          {allPages.length > 1 && (
            <div style={{ display:'flex', gap:8, marginTop:10, overflowX:'auto', paddingBottom:4 }}>
              {allPages.map((p, i) => (
                <div key={i} onClick={() => setViewingPage(i)} style={{ width:52, height:52, flexShrink:0, borderRadius:6, overflow:'hidden', border:`2px solid ${viewingPage===i?'#3b82f6':'rgba(255,255,255,0.3)'}`, cursor:'pointer', background:'white' }}>
                  <ScannedDoc src={p.src} corners={p.corners} filterMode={p.filterMode} brightness={p.brightness} contrast={p.contrast} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.card({ marginBottom:14 })}>
          <div style={{ fontSize:15, fontWeight:800, marginBottom:14 }}>Details</div>
          {[['Type', `${dt.icon} ${dt.label}`], ['Document #', doc.docNumber||'—'], ['Pages', `${allPages.length} page${allPages.length!==1?'s':''}`], ['Location', doc.gpsLocation ? (doc.gpsLocation.label || `${doc.gpsLocation.latitude.toFixed(4)}, ${doc.gpsLocation.longitude.toFixed(4)}`) : '—'], ['Submitted', new Date(doc.submittedAt).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })]].map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #f3f4f6' }}>
              <span style={{ fontSize:13, color:'#6b7280', fontWeight:600 }}>{k}</span>
              <span style={{ fontSize:13, color:'#111827', fontWeight:700 }}>{v}</span>
            </div>
          ))}
        </div>

        {doc.pdfUrl && (
          <a href={doc.pdfUrl} target="_blank" rel="noreferrer" style={{ ...S.btn('#0e9f6e', { textDecoration:'none', textAlign:'center', display:'block', marginBottom:14 }) }}>
            📥 Download PDF
          </a>
        )}

        {doc.adminNotes && <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:14, padding:'14px 16px' }}>
          <div style={{ fontSize:12, fontWeight:800, color:'#92400e', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>Admin Notes</div>
          <div style={{ fontSize:14, color:'#78350f', lineHeight:1.6 }}>{doc.adminNotes}</div>
        </div>}
      </div>
    </div>
  )
}


// ── Pay settlement helpers (module scope) ─────────────────────────────────────
// Uses the currency the settlement was issued in, not a hardcoded USD.
function fmtMoney(n, cur) {
  if (n === undefined || n === null || isNaN(n)) return '—'
  return formatMoney(n, cur)
}
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''))
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function SettStatusBadge({ status }) {
  const map = {
    issued:   { bg: '#eff6ff', fg: '#1a56db', label: 'Issued' },
    queried:  { bg: '#fef3c7', fg: '#92400e', label: 'Query open' },
    resolved: { bg: '#dcfce7', fg: '#166534', label: 'Resolved' },
  }
  const c = map[status] || map.issued
  return <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:c.bg, color:c.fg, flexShrink:0 }}>{c.label}</span>
}

// Module scope on purpose — defining this inside DriverApp would give it a new
// identity every keystroke in the message box and remount-blur the input (the
// ActivatePage focus bug).
function SettlementDetail({ settlement: st, onBack, onUpdated, toast }) {
  const { isTablet } = useBreakpoints()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [local, setLocal] = useState(st)

  const send = async () => {
    const msg = text.trim()
    if (!msg) { toast('Write a message first', 'error'); return }
    setSending(true)
    try {
      const r = await api.commentSettlement(local.id, msg)
      const updated = {
        ...local,
        comments: [...(local.comments || []), r.comment],
        status: r.status || local.status,
      }
      setLocal(updated)
      onUpdated?.(updated)
      setText('')
      toast('✓ Sent to your office', 'success')
    } catch (e) { toast(e.message, 'error') }
    setSending(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', maxWidth:isTablet?720:600, margin:'0 auto', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'20px 16px 18px', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', borderRadius:10, padding:'7px 13px', cursor:'pointer', fontSize:16 }}>←</button>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>Pay Settlement</div>
            <div style={{ fontSize:17, fontWeight:700, color:'white' }}>{fmtMoney(local.amount, local.currency)}</div>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 16px 100px' }}>
        <div style={S.card({ marginBottom:14 })}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            {[
              ['Pay period', `${fmtDate(local.periodStart)} – ${fmtDate(local.periodEnd)}`],
              ['Deposited', fmtDate(local.depositDate)],
              ['Amount', fmtMoney(local.amount, local.currency)],
              ['Uploaded by', local.uploadedBy?.department || local.uploadedBy?.name || 'Office'],
            ].map(([k, v]) => (
              <div key={k} style={{ background:'#f9fafb', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'#9ca3af', fontWeight:700, marginBottom:3, textTransform:'uppercase', letterSpacing:0.5 }}>{k}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {local.pdfUrl && (
              <a href={local.pdfUrl} target="_blank" rel="noreferrer" style={{ ...S.btn('#0e9f6e', { textDecoration:'none', textAlign:'center' }) }}>
                📥 Download settlement PDF
              </a>
            )}
            <SettStatusBadge status={local.status} />
          </div>
        </div>

        <div style={S.card()}>
          <div style={{ fontSize:14, fontWeight:800, color:'#111827', marginBottom:4 }}>Questions about this settlement?</div>
          <div style={{ fontSize:12, color:'#6b7280', marginBottom:14, lineHeight:1.5 }}>
            Ask here — your office sees it immediately and replies in this thread. No phone calls needed.
          </div>

          {(local.comments || []).map(c => (
            <div key={c.id} style={{ display:'flex', justifyContent:c.side === 'driver' ? 'flex-end' : 'flex-start', marginBottom:10 }}>
              <div style={{
                maxWidth:'85%', borderRadius:14, padding:'9px 13px',
                background: c.side === 'driver' ? '#1a56db' : '#f1f5f9',
                color: c.side === 'driver' ? 'white' : '#111827',
              }}>
                <div style={{ fontSize:13, lineHeight:1.5 }}>{c.text}</div>
                <div style={{ fontSize:10, marginTop:4, opacity:0.65 }}>
                  {c.side === 'driver' ? 'You' : `${c.by?.name || 'Office'}${c.by?.department ? ` · ${c.by.department}` : ''}`} · {new Date(c.at).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                </div>
              </div>
            </div>
          ))}

          {local.status === 'resolved' && (
            <div style={{ fontSize:12, color:'#166534', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'8px 12px', marginBottom:12 }}>
              ✓ Your office marked this query resolved. Reply again if something's still off.
            </div>
          )}

          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} disabled={sending}
            placeholder="e.g. I think 4 hours from Tuesday are missing…"
            style={{ ...S.input, resize:'vertical', marginBottom:10 }} />
          <button onClick={send} disabled={sending} style={{ ...S.btn('#1a56db'), width:'100%' }}>
            {sending ? 'Sending…' : 'Send to office'}
          </button>
        </div>
      </div>
    </div>
  )
}
