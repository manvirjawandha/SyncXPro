// Offline capture queue — the reason this app exists as a native app rather
// than a bookmark.
//
// A driver scans a POD at a dock with no signal. Instead of failing, we write
// the whole submission to the device's private storage and upload it the moment
// connectivity returns. Nothing is lost, and the driver never thinks about it.
//
// Storage layout:
//   Preferences["syncx_queue_index"] -> JSON array of ids (small, fast to read)
//   Filesystem   queue/<id>.json     -> the full payload incl. base64 pages (MBs)
//
// Page images are far too large for Preferences/SharedPreferences, which is why
// payloads go to the filesystem and only the index lives in key/value storage.

import { isNative, isOnline } from './native'
import { api } from './api'

const INDEX_KEY = 'syncx_queue_index'
const QUEUE_DIR = 'queue'

async function Prefs() {
  const { Preferences } = await import('@capacitor/preferences')
  return Preferences
}

async function FS() {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  return { Filesystem, Directory, Encoding }
}

// ── index ────────────────────────────────────────────────────────────────────

async function readIndex() {
  try {
    const P = await Prefs()
    const { value } = await P.get({ key: INDEX_KEY })
    return value ? JSON.parse(value) : []
  } catch { return [] }
}

async function writeIndex(ids) {
  const P = await Prefs()
  await P.set({ key: INDEX_KEY, value: JSON.stringify(ids) })
}

// ── payloads ─────────────────────────────────────────────────────────────────

async function writePayload(id, payload) {
  const { Filesystem, Directory, Encoding } = await FS()
  await Filesystem.writeFile({
    path: `${QUEUE_DIR}/${id}.json`,
    data: JSON.stringify(payload),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

async function readPayload(id) {
  const { Filesystem, Directory, Encoding } = await FS()
  const res = await Filesystem.readFile({
    path: `${QUEUE_DIR}/${id}.json`,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  })
  return JSON.parse(res.data)
}

async function deletePayload(id) {
  try {
    const { Filesystem, Directory } = await FS()
    await Filesystem.deleteFile({ path: `${QUEUE_DIR}/${id}.json`, directory: Directory.Data })
  } catch { /* already gone — fine */ }
}

// ── public API ───────────────────────────────────────────────────────────────

export async function pendingCount() {
  if (!isNative()) return 0
  return (await readIndex()).length
}

// Save a submission for later. Returns the queue id.
export async function enqueue(payload) {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await writePayload(id, { ...payload, queuedAt: Date.now() })
  const ids = await readIndex()
  ids.push(id)
  await writeIndex(ids)
  return id
}

let flushing = false

// Try to upload everything queued. Safe to call often — it self-guards against
// overlapping runs and stops early if the connection drops mid-flush.
// Returns { sent, failed, remaining }.
export async function flush(onProgress) {
  if (!isNative() || flushing) return { sent: 0, failed: 0, remaining: await pendingCount() }
  if (!(await isOnline())) return { sent: 0, failed: 0, remaining: await pendingCount() }

  flushing = true
  let sent = 0, failed = 0
  try {
    let ids = await readIndex()
    for (const id of [...ids]) {
      if (!(await isOnline())) break // signal dropped again — leave the rest queued
      try {
        const payload = await readPayload(id)
        await api.submitDocument({
          docType: payload.docType,
          docNumber: payload.docNumber,
          gpsLocation: payload.gpsLocation,
          pages: payload.pages,
          // Must be forwarded, or a request scanned offline would upload fine
          // but stay "waiting" on the admin's screen forever.
          requestId: payload.requestId || null,
        })
        await deletePayload(id)
        ids = ids.filter(x => x !== id)
        await writeIndex(ids)
        sent++
        onProgress?.({ sent, remaining: ids.length })
      } catch (e) {
        // Leave it queued and try again next time. A 4xx would retry forever,
        // so drop payloads the server has explicitly rejected as invalid.
        const msg = String(e?.message || '')
        if (/invalid|not found|unauthor|forbidden/i.test(msg)) {
          await deletePayload(id)
          ids = ids.filter(x => x !== id)
          await writeIndex(ids)
        }
        failed++
      }
    }
    return { sent, failed, remaining: ids.length }
  } finally {
    flushing = false
  }
}

// Discard everything (used by "clear queue" in the UI if a driver wants out).
export async function clearQueue() {
  const ids = await readIndex()
  for (const id of ids) await deletePayload(id)
  await writeIndex([])
}
