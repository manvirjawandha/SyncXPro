// Native bridge for the SyncX Driver app (Android / iOS via Capacitor).
//
// IMPORTANT: every function here falls back to the exact web behaviour when not
// running natively, so the deployed website keeps working unchanged. The heavy
// Capacitor plugins are pulled in with dynamic import() so they never land in
// the website's bundle — they're only fetched when we're actually on a device.

import { Capacitor } from '@capacitor/core'

export function isNative() {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

export function platform() {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

// ── Camera ───────────────────────────────────────────────────────────────────
// Returns a data URL ("data:image/jpeg;base64,...") — the same shape the web
// FileReader path produces, so downstream cropping/filtering code is unchanged.

export async function capturePhoto() {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    correctOrientation: true,
    saveToGallery: false,
  })
  return photo.dataUrl
}

export async function pickPhoto() {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    correctOrientation: true,
  })
  return photo.dataUrl
}

// ── Geolocation ──────────────────────────────────────────────────────────────
// Resolves to the same { coords: { latitude, longitude, accuracy } } shape as
// navigator.geolocation, so callers don't branch.

export async function getPosition() {
  if (!isNative()) {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    )
  }
  const { Geolocation } = await import('@capacitor/geolocation')
  let perm = await Geolocation.checkPermissions()
  if (perm.location !== 'granted') {
    perm = await Geolocation.requestPermissions()
    if (perm.location !== 'granted') throw new Error('Location permission denied')
  }
  return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
}

// ── Document scanner (ML Kit on Android, VisionKit on iOS) ──────────────────
// Wraps @capgo/capacitor-document-scanner: one JS call, and each platform gets
// its own free, on-device system scanner — automatic edge detection,
// perspective correction, and multi-page capture in a single session.
//
// Returns an array of data URLs of ALREADY-cropped, already-enhanced pages, so
// callers can skip the manual crop/filter steps entirely.
//
// KNOWN LIMIT: ML Kit does not run on Android emulators (Play services
// restriction) — it throws there. Callers must catch and fall back to the
// plain camera. VisionKit needs a real iOS device too.

// Normalise whatever the plugin returns (raw base64 or a file path/URI) into a
// data URL, which is what the rest of the capture pipeline speaks.
async function toDataUrl(img) {
  if (!img) return null
  if (img.startsWith('data:')) return img
  // A long string with no path separators is raw base64.
  if (!img.includes('/') && img.length > 200) return `data:image/jpeg;base64,${img}`
  // Otherwise it's a native file path/URI (e.g. file:///.../scan.jpg on iOS) —
  // read it through the WebView bridge.
  try {
    const src = Capacitor.convertFileSrc(img)
    const res = await fetch(src)
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('Could not read scanned page'))
      r.readAsDataURL(blob)
    })
  } catch (e) {
    console.error('[scanner] toDataUrl failed for', img, e?.message)
    throw e
  }
}

export async function scanDocumentPages(maxPages = 20) {
  const { DocumentScanner } = await import('@capgo/capacitor-document-scanner')
  // Use the documented default response (image file paths). The current Capgo
  // plugin returns paths, which toDataUrl() converts via convertFileSrc(). We
  // dropped the old `croppedImageQuality` option — it isn't part of the current
  // plugin API and passing unknown options can make the iOS scanner misbehave
  // (it captures but never resolves, so the camera just reopens).
  const result = await DocumentScanner.scanDocument({
    // iOS (VisionKit) caps a session at 24 pages; clamp to be safe everywhere.
    maxNumDocuments: Math.max(1, Math.min(maxPages, 24)),
    letUserAdjustCrop: true,      // driver can nudge the detected edges
    responseType: 'imageFilePath',
  })
  console.log('[scanner] raw result:', JSON.stringify(result)?.slice(0, 300))
  // User backed out of the scanner — not an error, just nothing to add.
  if (result?.status === 'cancel' || !result?.scannedImages?.length) return []
  const pages = []
  for (const img of result.scannedImages) {
    const dataUrl = await toDataUrl(img)
    if (dataUrl) pages.push(dataUrl)
  }
  console.log('[scanner] converted pages:', pages.length)
  return pages
}

// ── Network ──────────────────────────────────────────────────────────────────

export async function isOnline() {
  if (!isNative()) return navigator.onLine
  try {
    const { Network } = await import('@capacitor/network')
    const status = await Network.getStatus()
    return status.connected
  } catch { return true } // if we can't tell, try the upload and let it fail loudly
}

// Calls cb(connected: boolean) whenever connectivity changes.
// Returns an unsubscribe function.
export async function onNetworkChange(cb) {
  if (!isNative()) {
    const on = () => cb(true)
    const off = () => cb(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }
  const { Network } = await import('@capacitor/network')
  const handle = await Network.addListener('networkStatusChange', s => cb(s.connected))
  return () => handle.remove()
}

// Open the OS Settings page for THIS app, so the driver can flip camera /
// photo / location permissions. Apps can't toggle iOS permissions directly —
// deep-linking to Settings is the Apple-sanctioned pattern.
export async function openAppSettings() {
  if (!isNative()) { alert('Open your browser or device settings to change permissions.'); return }
  try {
    const { App } = await import('@capacitor/app')
    // Capacitor's App plugin doesn't expose openSettings on all versions;
    // NativeSettings is the reliable route. Fall back gracefully.
    try {
      const { NativeSettings, IOSSettings, AndroidSettings } = await import('capacitor-native-settings')
      await NativeSettings.open({ optionIOS: IOSSettings.App, optionAndroid: AndroidSettings.ApplicationDetails })
      return
    } catch {
      // Plugin not installed — tell the user how to do it manually.
      alert('To change permissions, open Settings › SyncX Pro Driver on your device.')
    }
  } catch (e) {
    alert('To change permissions, open your device Settings for SyncX Pro Driver.')
  }
}

// Check current status of the permissions we use, for display in Settings.
export async function checkAppPermissions() {
  const out = { camera: 'unknown', location: 'unknown', photos: 'unknown' }
  if (!isNative()) return out
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const g = await Geolocation.checkPermissions()
    out.location = g.location || 'unknown'
  } catch {}
  try {
    const { Camera } = await import('@capacitor/camera')
    const c = await Camera.checkPermissions()
    out.camera = c.camera || 'unknown'
    out.photos = c.photos || 'unknown'
  } catch {}
  return out
}
