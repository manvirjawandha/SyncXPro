// api/index.js — Vercel serverless function (all /api/* requests are
// rewritten here by vercel.json). Also imported directly by server/index.js
// for local development, so local and production always run identical code.
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { randomUUID, createHash } from 'crypto'
import admin from 'firebase-admin'
import sgMail from '@sendgrid/mail'
import Anthropic from '@anthropic-ai/sdk'
import { PDFDocument } from 'pdf-lib'
import twilio from 'twilio'
import dotenv from 'dotenv'
dotenv.config() // loads .env for local dev; on Vercel, env vars are already
                 // injected into process.env and this is a harmless no-op

// ── Firebase ──────────────────────────────────────────────────────────────────
// Everything here is wrapped in one try/catch — including firestore()/bucket(),
// which throw synchronously if FIREBASE_STORAGE_BUCKET or the service account
// JSON is malformed. Previously that throw happened OUTSIDE any try/catch,
// which could crash the whole serverless module on cold start. Now we degrade
// gracefully instead — db/bucket stay null and requests that need them get a
// clear 503 (see the middleware below) instead of hanging forever.
let db = null, bucket = null, firebaseError = null
try {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set')
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    })
  }
  db = admin.firestore()
  bucket = admin.storage().bucket()
} catch (e) {
  firebaseError = e.message
  console.error('Firebase init failed:', e.message)
}
const FieldValue = admin.firestore.FieldValue

// Wraps an async route handler so any thrown error/rejected promise reaches
// Express's error-handling middleware instead of hanging the request.
// Express 4 does NOT catch errors thrown inside async functions on its own.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// ── Password hashing ──────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password + (process.env.JWT_SECRET || 'dev')).digest('hex')
}
function genSalt() { return randomUUID().replace(/-/g, '') }

// ── PDF Generation ────────────────────────────────────────────────────────────
// Takes array of base64 JPEG strings (one per page), returns a PDF buffer.
async function generatePDF(pages, docLabel, driverName, docNumber) {
  const pdfDoc = await PDFDocument.create()

  // Add metadata
  pdfDoc.setTitle(`${docLabel} — ${driverName}`)
  pdfDoc.setAuthor('SyncX Pro')
  pdfDoc.setSubject(docNumber || 'No document number')
  pdfDoc.setCreationDate(new Date())

  let embeddedCount = 0

  for (let idx = 0; idx < pages.length; idx++) {
    const pageData = pages[idx]
    let bytes, declaredType = ''

    // Resolve the image bytes + declared mime type
    if (pageData.src && pageData.src.startsWith('data:')) {
      const m = pageData.src.match(/^data:(image\/(\w+));base64,(.+)$/)
      if (!m) { console.error(`Page ${idx}: unrecognized data URL, skipping`); continue }
      declaredType = m[2].toLowerCase()
      bytes = Buffer.from(m[3], 'base64')
    } else if (pageData.src && pageData.src.startsWith('http')) {
      const res = await fetch(pageData.src)
      if (!res.ok) { console.error(`Page ${idx}: fetch failed ${res.status}, skipping`); continue }
      bytes = Buffer.from(await res.arrayBuffer())
    } else {
      console.error(`Page ${idx}: no usable src, skipping`)
      continue
    }

    if (!bytes || bytes.length < 100) { console.error(`Page ${idx}: image bytes too small (${bytes?.length}), skipping`); continue }

    // Detect the REAL format from magic bytes, not the declared type.
    // canvas.toDataURL can label things loosely and pdf-lib is strict:
    // JPEG must start FF D8 FF, PNG must start 89 50 4E 47.
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47

    let image
    try {
      if (isJpeg) image = await pdfDoc.embedJpg(bytes)
      else if (isPng) image = await pdfDoc.embedPng(bytes)
      else {
        // Unknown magic bytes — try declared type, then both, before giving up
        if (declaredType === 'png') image = await pdfDoc.embedPng(bytes)
        else image = await pdfDoc.embedJpg(bytes)
      }
    } catch (e1) {
      // Last-ditch: try the other codec
      try { image = isJpeg ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes) }
      catch (e2) { console.error(`Page ${idx}: embed failed (${e1.message} / ${e2.message}), skipping`); continue }
    }

    if (!image || !image.width || !image.height) { console.error(`Page ${idx}: embedded image has no dimensions, skipping`); continue }

    // Page size matches image aspect ratio, A4 width as max
    const A4_WIDTH = 595, A4_HEIGHT = 842
    const ratio = image.width / image.height
    let w = A4_WIDTH, h = A4_WIDTH / ratio
    if (h > A4_HEIGHT) { h = A4_HEIGHT; w = A4_HEIGHT * ratio }

    const page = pdfDoc.addPage([w, h])
    page.drawImage(image, { x: 0, y: 0, width: w, height: h })
    embeddedCount++
  }

  // If nothing embedded, throw so the caller knows the PDF is unusable
  // (better a clear failure than a silent blank white page in someone's inbox).
  if (embeddedCount === 0) throw new Error('No pages could be embedded into the PDF')

  return Buffer.from(await pdfDoc.save())
}

// ── Image Upload ──────────────────────────────────────────────────────────────
async function uploadImage(companyId, docId, pageIndex, base64) {
  const m = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!m) throw new Error('Invalid image format')
  const ext = m[1].split('/')[1] || 'jpg'
  const file = bucket.file(`docs/${companyId}/${docId}/page_${pageIndex}.${ext}`)
  await file.save(Buffer.from(m[2], 'base64'), { metadata: { contentType: m[1] } })
  // Generate a signed URL valid for 7 days — no makePublic() needed
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  })
  return signedUrl
}

async function uploadPDF(companyId, docId, pdfBuffer) {
  const file = bucket.file(`docs/${companyId}/${docId}/document.pdf`)
  await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } })
  // Generate a signed URL valid for 7 days — no makePublic() needed
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  })
  return signedUrl
}

// ── Email with PDF attachment ─────────────────────────────────────────────────
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

const DOC_LABELS = {
  bill_of_lading: 'Bill of Lading', freight_bill: 'Freight Bill',
  trip_cost_report: 'Trip Cost Report', fuel_receipt: 'Fuel Receipt',
  lumper_receipt: 'Lumper Receipt', proof_of_delivery: 'Proof of Delivery',
  weight_ticket: 'Weight Tag/Scale Ticket', osnd: 'OS&D', other: 'Other',
}

async function sendEmailNotification(doc, company, pdfBuffer) {
  const label = DOC_LABELS[doc.docType] || 'Document'

  // Per-document-type routing: if the admin set a specific address for this
  // document type, use it; otherwise fall back to the default notifyEmails.
  const routing = company.docTypeEmails || {}
  const routed = (routing[doc.docType] || '').trim()
  const source = routed || company.notifyEmails || ''
  const emails = source.split(',').map(s => s.trim()).filter(Boolean)
  if (!emails.length) return { sent: false, reason: 'No notification emails configured for this document type' }
  const pageCount = doc.pages?.length || 1

  // Validate SendGrid setup
  if (!process.env.SENDGRID_API_KEY) return { sent: false, reason: 'SENDGRID_API_KEY is not set' }
  if (!process.env.SENDGRID_FROM_EMAIL) return { sent: false, reason: 'SENDGRID_FROM_EMAIL is not set' }

  // Build the email body in the exact requested format:
  // "DriverName has submitted a DocumentType (Doc Number: XXX) on Date at Time."
  const submitted = new Date(doc.submittedAt)
  const dateStr = submitted.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const timeStr = submitted.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const body = `${doc.driverName} has submitted a ${label} (Doc Number: ${doc.docNumber || 'N/A'}) on ${dateStr} at ${timeStr}.`

  const filename = `${label.replace(/[^a-z0-9]/gi, '_')}_${doc.driverName.replace(/\s+/g, '_')}_${new Date(doc.submittedAt).toISOString().split('T')[0]}.pdf`

  try {
    await sgMail.send({
      to: emails,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'SyncX Pro' },
      subject: `[SyncX Pro] ${label} (${pageCount}p) from ${doc.driverName}`,
      text: body,
      attachments: pdfBuffer ? [{
        content: pdfBuffer.toString('base64'),
        filename,
        type: 'application/pdf',
        disposition: 'attachment',
      }] : [],
    })
    return { sent: true, filename, emails }
  } catch (e) { 
    console.error('SendGrid send failed:', e.message)
    return { sent: false, reason: `SendGrid error: ${e.message}` }
  }
}

// ── JWT ───────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const signToken = u => jwt.sign({ username: u }, JWT_SECRET, { expiresIn: '30d' })
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try { req.auth = jwt.verify(token, JWT_SECRET); next() }
  catch { res.status(401).json({ error: 'Session expired, please log in again' }) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const genCompanyId = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'CO' + Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('')
}
const getUser = async username => {
  if (!db) return null
  const s = await db.collection('users').doc(username.toLowerCase()).get()
  return s.exists ? s.data() : null
}

// Admin OR staff (department sub-accounts). Staff can read documents, review
// them, run document requests, and manage settlements — but cannot touch
// company settings, drivers, other staff, or delete anything.
const isCompanyStaff = u => !!u && (u.role === 'admin' || u.role === 'staff')
// Short display tag used for attribution on documents/settlements/comments.
const actorTag = u => ({ username: u.username, name: u.name || u.username, department: u.department || (u.role === 'admin' ? 'Admin' : '') })

// ── Twilio Verify ─────────────────────────────────────────────────────────────
// Isolated behind two helpers so the rest of the code never touches Twilio
// directly. If you ever switch providers, only these two functions change.
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || ''
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
const TWILIO_VERIFY_SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID || ''
let twilioClient = null
try {
  if (TWILIO_SID && TWILIO_TOKEN) twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN)
} catch (e) { console.error('Twilio init failed:', e.message) }

const twilioConfigured = () => !!(twilioClient && TWILIO_VERIFY_SERVICE)

// Normalize a phone to E.164-ish. Twilio requires E.164 (+15551234567).
// We do light cleanup; Twilio itself does the authoritative validation.
function normalizePhone(raw) {
  if (!raw) return ''
  let p = String(raw).trim().replace(/[^\d+]/g, '')
  if (!p.startsWith('+')) {
    // Assume US/Canada if no country code and 10 digits
    if (p.length === 10) p = '+1' + p
    else if (p.length === 11 && p.startsWith('1')) p = '+' + p
    else p = '+' + p
  }
  return p
}

async function sendVerificationCode(phone) {
  if (!twilioConfigured()) return { ok: false, reason: 'Phone verification is not configured on the server' }
  try {
    await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE).verifications.create({ to: phone, channel: 'sms' })
    return { ok: true }
  } catch (e) {
    console.error('Twilio send error:', e.message)
    return { ok: false, reason: e.message || 'Could not send verification code' }
  }
}

async function checkVerificationCode(phone, code) {
  if (!twilioConfigured()) return { ok: false, reason: 'Phone verification is not configured on the server' }
  try {
    const check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE).verificationChecks.create({ to: phone, code })
    return { ok: check.status === 'approved', reason: check.status !== 'approved' ? 'Invalid or expired code' : undefined }
  } catch (e) {
    console.error('Twilio check error:', e.message)
    return { ok: false, reason: e.message || 'Could not verify code' }
  }
}

// ── Operator (SyncX Pro ops) auth ─────────────────────────────────────────────────
// The operator is NOT stored in the users collection. Credentials live in env
// vars so the ops portal is entirely separate from the public user system.
const OPS_USERNAME = (process.env.OPS_USERNAME || '').toLowerCase()
const OPS_PASSWORD_HASH = process.env.OPS_PASSWORD_HASH || '' // sha256(password + OPS_SALT)
const OPS_SALT = process.env.OPS_SALT || 'syncx-ops'
const OPS_SECRET_PATH = process.env.OPS_SECRET_PATH || '' // extra gate: must match
const opsHash = pw => createHash('sha256').update(pw + OPS_SALT).digest('hex')
const signOpsToken = () => jwt.sign({ ops: true, u: OPS_USERNAME }, JWT_SECRET, { expiresIn: '7d' })
function requireOps(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (!payload.ops) return res.status(403).json({ error: 'Operator access required' })
    req.ops = payload
    next()
  } catch { res.status(401).json({ error: 'Session expired, please log in again' }) }
}

// Generate a unique company ID that doesn't already exist
async function genUniqueCompanyId() {
  for (let i = 0; i < 10; i++) {
    const id = genCompanyId()
    const exists = await db.collection('companies').doc(id).get()
    if (!exists.exists) return id
  }
  return genCompanyId() + Math.floor(Math.random() * 90 + 10)
}

// Generate a unique admin username from the company name
async function genUniqueUsername(companyName) {
  const base = (companyName || 'admin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'admin'
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${i}`
    if (candidate.length >= 3 && !(await getUser(candidate))) return candidate
  }
  return base + Math.floor(Math.random() * 9000 + 1000)
}

function genActivationToken() { return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '') }

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(cors())
app.use(express.json({ limit: '50mb' })) // larger limit for multi-page docs
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many requests' } })
app.use('/api/auth', limiter)

// Health — reports whether Firebase actually initialized, so a misconfigured
// deployment is visible immediately instead of surfacing as a mysterious
// hang on the signup form.
app.get('/api/health', (req, res) => res.json({
  status: db && bucket ? 'ok' : 'degraded',
  firebaseConfigured: !!(db && bucket),
  firebaseError: firebaseError || undefined,
  time: new Date().toISOString(),
}))

// Every route below except /api/health needs Firebase. Fail fast and clearly
// instead of letting individual handlers throw on `db.collection(...)` when
// db is null — that used to be an uncaught error that could hang the request.
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next()
  if (!db || !bucket) {
    return res.status(503).json({ error: 'Server is not configured correctly (Firebase). Check FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_STORAGE_BUCKET env vars.' })
  }
  next()
})

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', asyncHandler(async (req, res) => {
  const { username, password, role, companyName, notifyEmails, driverName, companyId } = req.body
  if (!username?.trim()) return res.status(400).json({ error: 'Username is required' })
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  if (!['admin', 'driver'].includes(role)) return res.status(400).json({ error: 'Invalid role' })
  const uname = username.trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Username: 3-30 chars, letters/numbers/dots/dashes only' })
  if (await getUser(uname)) return res.status(409).json({ error: 'Username already taken' })

  const salt = genSalt()
  const passwordHash = hashPassword(password, salt)

  if (role === 'admin') {
    // Admin accounts can no longer be self-created. Companies are provisioned
    // by the SyncX Pro operator, who generates the username + Company ID and sends
    // the client an activation link to set their own password via phone verification.
    return res.status(403).json({ error: 'Admin accounts are created by SyncX. Please contact us to set up your company.' })
  }

  if (role === 'driver') {
    if (!driverName?.trim()) return res.status(400).json({ error: 'Name required' })
    const cId = (companyId || '').trim().toUpperCase()
    if (!cId) return res.status(400).json({ error: 'Company ID required' })
    const cs = await db.collection('companies').doc(cId).get()
    if (!cs.exists) return res.status(404).json({ error: 'Company not found. Check the ID with your admin.' })

    // Self-signup requires phone verification via OTP. The driver must have
    // requested a code (driver-send-code) and pass it here. Admin-created
    // drivers use a different route and skip this entirely.
    const phone = normalizePhone(req.body.phone || '')
    if (twilioConfigured()) {
      if (!phone) return res.status(400).json({ error: 'Phone number is required' })
      if (!req.body.code) return res.status(400).json({ error: 'Verification code is required' })
      const check = await checkVerificationCode(phone, req.body.code)
      if (!check.ok) return res.status(400).json({ error: check.reason || 'Invalid or expired verification code' })
    }

    const user = { username: uname, passwordHash, salt, role: 'driver', companyId: cId, companyName: cs.data().name, name: driverName.trim(), phone: phone || '', phoneVerified: twilioConfigured() ? true : false, createdAt: Date.now() }
    await db.collection('users').doc(uname).set(user)
    await db.collection('companies').doc(cId).collection('drivers').doc(uname).set({ username: uname, name: driverName.trim(), companyId: cId, phone: phone || '', phoneVerified: user.phoneVerified, docCount: 0, joinedAt: Date.now() })
    const { passwordHash: _, salt: __, ...safe } = user
    return res.json({ token: signToken(uname), user: safe })
  }

  return res.status(400).json({ error: 'Invalid role' })
}))

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' })
  const user = await getUser(username.trim().toLowerCase())
  // Pending admin accounts have no password hash yet — they must activate first.
  if (user && user.status === 'pending' && !user.passwordHash) {
    return res.status(403).json({ error: 'This account has not been activated yet. Please use the activation link sent to your email.' })
  }
  if (!user || !user.passwordHash || hashPassword(password, user.salt) !== user.passwordHash)
    return res.status(401).json({ error: 'Incorrect username or password' })
  const { passwordHash, salt, ...safe } = user
  res.json({ token: signToken(user.username), user: safe })
}))

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { passwordHash, salt, ...safe } = user
  res.json({ user: safe })
}))
app.put('/api/users/update-emails', requireAuth, asyncHandler(async (req, res) => {
  const { notifyEmails } = req.body
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  await db.collection('users').doc(req.auth.username).update({ notifyEmails })
  await db.collection('companies').doc(user.companyId).update({ notifyEmails })
  res.json({ ok: true })
}))

// ── Company ───────────────────────────────────────────────────────────────────
app.get('/api/company/drivers', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const s = await db.collection('companies').doc(user.companyId).collection('drivers').get()
  res.json({ drivers: s.docs.map(d => d.data()) })
}))

// ── Documents ─────────────────────────────────────────────────────────────────
// pages: [{ src: base64, corners, filterMode, brightness, contrast }, ...]
app.post('/api/documents', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'driver') return res.status(403).json({ error: 'Driver only' })

  const { docType, docNumber, gpsLocation, pages, requestId } = req.body
  if (!docType) return res.status(400).json({ error: 'Document type required' })
  if (!pages?.length) return res.status(400).json({ error: 'At least one page required' })
  if (pages.length > 20) return res.status(400).json({ error: 'Maximum 20 pages per document' })

  const id = randomUUID()

  // Upload each page image to storage
  let uploadedPages
  try {
    uploadedPages = await Promise.all(pages.map(async (page, i) => {
      const url = await uploadImage(user.companyId, id, i, page.src)
      return { ...page, src: url, pageIndex: i, rotation: page.rotation || 0 }
    }))
  } catch (e) {
    return res.status(500).json({ error: 'Image upload failed: ' + e.message })
  }

  // Generate PDF from all pages
  let pdfBuffer, pdfUrl, pdfError = null
  try {
    const label = DOC_LABELS[docType] || 'Document'
    pdfBuffer = await generatePDF(pages, label, user.name, docNumber) // use original base64 for PDF quality
    if (!pdfBuffer || pdfBuffer.length < 500) throw new Error('Generated PDF was empty')
    pdfUrl = await uploadPDF(user.companyId, id, pdfBuffer)
  } catch (e) {
    console.error('PDF generation failed:', e.message)
    pdfBuffer = null
    pdfError = e.message
    // Non-fatal — document still saves with page images, just no PDF
  }

  const doc = {
    id, docType, docNumber: docNumber || '', gpsLocation: gpsLocation || null,
    pages: uploadedPages, // array of pages with storage URLs
    pdfUrl: pdfUrl || null,
    pageCount: pages.length,
    // For backward compat — use first page as thumbnail
    src: uploadedPages[0]?.src || null,
    corners: uploadedPages[0]?.corners || null,
    filterMode: uploadedPages[0]?.filterMode || 'color',
    brightness: uploadedPages[0]?.brightness ?? 100,
    contrast: uploadedPages[0]?.contrast ?? 100,
    rotation: uploadedPages[0]?.rotation || 0,
    driverName: user.name,
    driverUsername: user.username,
    companyId: user.companyId,
    companyName: user.companyName,
    submittedAt: Date.now(),
    status: 'pending',
    requestId: requestId || null, // set when the driver scanned against an admin request
  }

  const batch = db.batch()
  batch.set(db.collection('companies').doc(user.companyId).collection('documents').doc(id), doc)
  batch.set(db.collection('companies').doc(user.companyId).collection('drivers').doc(user.username).collection('documents').doc(id), doc)
  await batch.commit()
  await db.collection('companies').doc(user.companyId).collection('drivers').doc(user.username)
    .update({ docCount: FieldValue.increment(1) }).catch(() => {})

  // If this was scanned against an admin request, close that request out. Done
  // after the document is stored so a failure here can never lose the scan —
  // worst case the request stays open and the admin sees the document anyway.
  if (requestId) {
    await db.collection('companies').doc(user.companyId).collection('requests').doc(requestId)
      .update({ status: 'fulfilled', fulfilledAt: Date.now(), documentId: id })
      .catch(e => console.error('Could not close request', requestId, e.message))
  }

  // Send email with PDF attached
  let emailSent = false, emailError = null
  try {
    const cs = await db.collection('companies').doc(user.companyId).get()
    if (!cs.exists) {
      emailError = 'Company not found in database'
    } else {
      const company = cs.data()
      // A document can be delivered if EITHER the default is set OR this
      // specific document type has its own routed address.
      const routedForType = ((company.docTypeEmails || {})[doc.docType] || '').trim()
      const hasDefault = company.notifyEmails && company.notifyEmails.trim() !== ''
      if (!routedForType && !hasDefault) {
        emailError = 'No notification emails configured for this document type'
      } else if (!pdfBuffer) {
        // Don't send an email with a blank/missing PDF attachment
        emailError = pdfError ? `PDF could not be generated (${pdfError})` : 'PDF unavailable'
      } else {
        const result = await sendEmailNotification(doc, company, pdfBuffer)
        emailSent = result.sent
        if (!emailSent) emailError = result.reason || 'Unknown email error'
      }
    }
  } catch (e) { 
    emailError = e.message
    console.error('Email error:', e.message) 
  }

  res.json({ document: doc, emailSent, emailError: emailError || undefined, pdfError: pdfError || undefined, pdfGenerated: !!pdfUrl })
}))

app.get('/api/documents/mine', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'driver') return res.status(403).json({ error: 'Driver only' })
  const s = await db.collection('companies').doc(user.companyId).collection('drivers')
    .doc(user.username).collection('documents').orderBy('submittedAt', 'desc').get()
  res.json({ documents: s.docs.map(d => d.data()) })
}))

app.get('/api/documents/company', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const s = await db.collection('companies').doc(user.companyId).collection('documents')
    .orderBy('submittedAt', 'desc').get()
  let docs = s.docs.map(d => d.data())
  const { search, status } = req.query
  if (status) docs = docs.filter(d => d.status === status)
  if (search) {
    const q = search.toLowerCase()
    docs = docs.filter(d => (d.driverName || '').toLowerCase().includes(q) || (d.docNumber || '').toLowerCase().includes(q))
  }
  res.json({ documents: docs })
}))

app.put('/api/documents/:id', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const ref = db.collection('companies').doc(user.companyId).collection('documents').doc(req.params.id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Not found' })
  const updates = {}
  if (req.body.status !== undefined) {
    updates.status = req.body.status
    // Attribution: which person (admin or department staff) reviewed it.
    if (req.body.status === 'reviewed') { updates.reviewedBy = actorTag(user); updates.reviewedAt = Date.now() }
  }
  if (req.body.adminNotes !== undefined) { updates.adminNotes = req.body.adminNotes; updates.notesBy = actorTag(user) }
  if (Object.keys(updates).length === 0) return res.json({ ok: true })
  // Primary record must update
  await ref.update(updates)
  // Mirror copy under the driver is best-effort (may not exist for older docs)
  try {
    await db.collection('companies').doc(user.companyId).collection('drivers')
      .doc(snap.data().driverUsername).collection('documents').doc(req.params.id).update(updates)
  } catch {}
  res.json({ ok: true })
}))

app.delete('/api/documents/:id', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const ref = db.collection('companies').doc(user.companyId).collection('documents').doc(req.params.id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Not found' })
  const doc = snap.data()
  const batch = db.batch()
  batch.delete(ref)
  batch.delete(db.collection('companies').doc(user.companyId).collection('drivers')
    .doc(doc.driverUsername).collection('documents').doc(req.params.id))
  await batch.commit()
  // Delete all files in storage for this doc
  try {
    const [files] = await bucket.getFiles({ prefix: `docs/${user.companyId}/${req.params.id}/` })
    await Promise.all(files.map(f => f.delete()))
  } catch {}
  res.json({ ok: true })
}))

// 404 for unmatched /api routes (JSON, not Vercel's default HTML page)

// Driver Management Routes
app.get('/api/company/drivers/list', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const s = await db.collection('companies').doc(user.companyId).collection('drivers').get()
  res.json({ drivers: s.docs.map(d => ({ username: d.data().username, name: d.data().name, docCount: d.data().docCount || 0 })) })
}))

app.post('/api/company/drivers/create', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { driverUsername, driverPassword, driverName } = req.body
  if (!driverUsername?.trim() || !driverName?.trim()) return res.status(400).json({ error: 'Name and username are required' })
  if (!driverPassword || driverPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  const uname = driverUsername.trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Username: 3-30 chars, letters/numbers/dots/dashes only' })
  if (await getUser(uname)) return res.status(409).json({ error: 'Username already taken' })
  const salt = genSalt()
  const passwordHash = hashPassword(driverPassword, salt)
  await db.collection('users').doc(uname).set({ username: uname, passwordHash, salt, role: 'driver', companyId: user.companyId, companyName: user.companyName, name: driverName.trim(), phoneVerified: true, addedByAdmin: true, createdAt: Date.now() })
  await db.collection('companies').doc(user.companyId).collection('drivers').doc(uname).set({ username: uname, name: driverName.trim(), companyId: user.companyId, phoneVerified: true, addedByAdmin: true, docCount: 0, joinedAt: Date.now() })
  res.json({ success: true, username: uname })
}))

app.delete('/api/company/drivers/:username', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const uname = req.params.username.toLowerCase()
  const driver = await getUser(uname)
  if (!driver || driver.role !== 'driver' || driver.companyId !== user.companyId) return res.status(403).json({ error: 'Driver not found in your company' })
  await db.collection('users').doc(uname).delete()
  await db.collection('companies').doc(user.companyId).collection('drivers').doc(uname).delete()
  res.json({ success: true })
}))

app.put('/api/company/drivers/:username', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const uname = req.params.username.toLowerCase()
  const driver = await getUser(uname)
  if (!driver || driver.role !== 'driver' || driver.companyId !== user.companyId) return res.status(403).json({ error: 'Driver not found in your company' })
  const updates = {}
  if (req.body.name?.trim()) updates.name = req.body.name.trim()
  if (req.body.password?.trim() && req.body.password.length >= 6) { const salt = genSalt(); updates.passwordHash = hashPassword(req.body.password, salt); updates.salt = salt }
  // Pay frequency override for this driver (e.g. a monthly owner-operator in a
  // weekly fleet). Empty string clears it back to the company default.
  if (req.body.payFrequency !== undefined) {
    if (['weekly','biweekly','semimonthly','monthly'].includes(req.body.payFrequency)) updates.payFrequency = req.body.payFrequency
    else if (req.body.payFrequency === '') updates.payFrequency = FieldValue.delete()
  }
  if (Object.keys(updates).length > 0) {
    await db.collection('users').doc(uname).update(updates)
    const mirror = {}
    if (updates.name) mirror.name = updates.name
    if (req.body.payFrequency !== undefined) mirror.payFrequency = updates.payFrequency
    if (Object.keys(mirror).length) await db.collection('companies').doc(user.companyId).collection('drivers').doc(uname).update(mirror).catch(() => {})
  }
  res.json({ success: true })
}))

app.put('/api/company/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const updates = {}
  if (req.body.name?.trim()) updates.name = req.body.name.trim()
  if (req.body.email?.trim()) updates.notifyEmails = req.body.email.trim()
  if (req.body.phone?.trim()) updates.phone = req.body.phone.trim()
  if (['weekly','biweekly','semimonthly','monthly'].includes(req.body.payFrequency)) updates.payFrequency = req.body.payFrequency
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' })
  await db.collection('companies').doc(user.companyId).update(updates)
  if (updates.name || updates.notifyEmails) {
    const userUpdates = {}
    if (updates.name) userUpdates.companyName = updates.name
    if (updates.notifyEmails) userUpdates.notifyEmails = updates.notifyEmails
    await db.collection('users').doc(user.username).update(userUpdates).catch(() => {})
  }
  res.json({ success: true })
}))

// Get full company settings (default email + per-type routing)
app.get('/api/company/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const cs = await db.collection('companies').doc(user.companyId).get()
  const c = cs.exists ? cs.data() : {}
  res.json({
    name: c.name || user.companyName || '',
    notifyEmails: c.notifyEmails || '',
    phone: c.phone || '',
    docTypeEmails: c.docTypeEmails || {},
  })
}))

// Update email routing: default address + optional per-document-type overrides.
// Sending an empty string for a type clears that override.
app.put('/api/company/email-routing', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const updates = {}
  if (typeof req.body.notifyEmails === 'string') updates.notifyEmails = req.body.notifyEmails.trim()
  if (req.body.docTypeEmails && typeof req.body.docTypeEmails === 'object') {
    // Keep only non-empty, trimmed entries so cleared overrides are removed
    const cleaned = {}
    for (const [k, v] of Object.entries(req.body.docTypeEmails)) {
      if (typeof v === 'string' && v.trim()) cleaned[k] = v.trim()
    }
    updates.docTypeEmails = cleaned
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' })
  await db.collection('companies').doc(user.companyId).update(updates)
  if (updates.notifyEmails !== undefined) {
    await db.collection('users').doc(user.username).update({ notifyEmails: updates.notifyEmails }).catch(() => {})
  }
  res.json({ success: true, ...updates })
}))

app.get('/api/documents/by-driver/:driverUsername', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  try { const s = await db.collection('companies').doc(user.companyId).collection('documents').where('driverUsername', '==', req.params.driverUsername).orderBy('submittedAt', 'desc').get(); res.json({ documents: s.docs.map(d => d.data()) }) } catch (e) { res.json({ documents: [] }) }
}))


// ════════════════════════════════════════════════════════════════════════════
// SyncX Pro OPERATOR PORTAL — private, not linked anywhere public.
// Gated by BOTH a secret path check AND operator login (env-var credentials).
// ════════════════════════════════════════════════════════════════════════════

// Operator login. Requires the secret path value to match (first gate) AND
// correct operator credentials (second gate).
app.post('/api/ops/login', limiter, asyncHandler(async (req, res) => {
  const { username, password, secretPath } = req.body
  // Gate 1: secret path. If OPS_SECRET_PATH is set, it must match.
  if (OPS_SECRET_PATH && secretPath !== OPS_SECRET_PATH) {
    return res.status(404).json({ error: 'Not found' }) // deny existence
  }
  // Gate 2: operator credentials
  if (!OPS_USERNAME || !OPS_PASSWORD_HASH) {
    return res.status(503).json({ error: 'Operator portal is not configured (set OPS_USERNAME, OPS_PASSWORD_HASH, OPS_SALT)' })
  }
  if ((username || '').toLowerCase() !== OPS_USERNAME || opsHash(password || '') !== OPS_PASSWORD_HASH) {
    return res.status(401).json({ error: 'Invalid operator credentials' })
  }
  res.json({ token: signOpsToken(), operator: OPS_USERNAME })
}))

// Verify a secret path is valid (so the UI can decide whether to show the login form)
app.post('/api/ops/check-path', asyncHandler(async (req, res) => {
  if (!OPS_SECRET_PATH) return res.json({ valid: true, noSecretConfigured: true })
  res.json({ valid: req.body.secretPath === OPS_SECRET_PATH })
}))

// List all companies (operator dashboard)
app.get('/api/ops/companies', requireOps, asyncHandler(async (req, res) => {
  const s = await db.collection('companies').orderBy('createdAt', 'desc').get()
  const companies = await Promise.all(s.docs.map(async d => {
    const c = d.data()
    // Count drivers
    let driverCount = 0
    try { const ds = await db.collection('companies').doc(c.id).collection('drivers').get(); driverCount = ds.size } catch {}
    return {
      id: c.id, name: c.name, adminUsername: c.adminUsername || null,
      contactName: c.contactName || null, contactEmail: c.contactEmail || null,
      contactPhone: c.contactPhone || null, status: c.status || 'active',
      notifyEmails: c.notifyEmails || '', createdAt: c.createdAt, activatedAt: c.activatedAt || null,
      driverCount,
    }
  }))
  res.json({ companies })
}))

// Provision a new company from a signup request. Operator supplies the client's
// info; system generates username + Company ID and emails an activation link.
app.post('/api/ops/companies/create', requireOps, asyncHandler(async (req, res) => {
  const { companyName, contactName, contactEmail, contactPhone, notifyEmails } = req.body
  if (!companyName?.trim()) return res.status(400).json({ error: 'Company name is required' })
  if (!contactEmail?.trim()) return res.status(400).json({ error: 'Contact email is required (activation link is sent here)' })

  const cId = await genUniqueCompanyId()
  const adminUsername = await genUniqueUsername(companyName)
  const activationToken = genActivationToken()
  const activationExpiry = Date.now() + 1000 * 60 * 60 * 24 * 7 // 7 days

  // Create the company in "pending" state (no password yet)
  const company = {
    id: cId,
    name: companyName.trim(),
    adminUsername,
    contactName: (contactName || '').trim(),
    contactEmail: contactEmail.trim(),
    contactPhone: normalizePhone(contactPhone || ''),
    notifyEmails: (notifyEmails || contactEmail).trim(),
    status: 'pending', // pending -> active once client sets password
    activationToken,
    activationExpiry,
    phoneVerified: false,
    createdAt: Date.now(),
    createdByOps: req.ops.u,
  }
  await db.collection('companies').doc(cId).set(company)

  // Pre-create the admin user record in pending state (no password hash yet)
  await db.collection('users').doc(adminUsername).set({
    username: adminUsername, role: 'admin', companyId: cId, companyName: companyName.trim(),
    name: companyName.trim(), notifyEmails: (notifyEmails || contactEmail).trim(),
    status: 'pending', createdAt: Date.now(),
  })

  // Email the activation link to the client
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  const activationLink = `${appUrl}/activate?token=${activationToken}&company=${cId}`
  let emailSent = false, emailError = null
  try {
    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
      emailError = 'SendGrid not configured'
    } else {
      await sgMail.send({
        to: contactEmail.trim(),
        from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'SyncX Pro' },
        subject: `Welcome to SyncX Pro — Activate your ${companyName.trim()} account`,
        text: `Hi ${contactName || 'there'},

Your SyncX Pro account for ${companyName.trim()} has been created. Here are your login details:

  Username: ${adminUsername}
  Company ID: ${cId}

To finish setting up your account, click the link below to verify your phone number and choose a password:

${activationLink}

This link expires in 7 days.

If you didn't request this, please ignore this email.

— SyncX Pro`,
      })
      emailSent = true
    }
  } catch (e) {
    console.error('Activation email failed:', e.message)
    emailError = e.message
  }

  res.json({
    success: true,
    company: { id: cId, name: companyName.trim(), adminUsername, contactEmail: contactEmail.trim() },
    activationLink, // returned so operator can copy/send manually if email failed
    emailSent, emailError: emailError || undefined,
  })
}))

// Resend activation link for a pending company
app.post('/api/ops/companies/:id/resend-activation', requireOps, asyncHandler(async (req, res) => {
  const cs = await db.collection('companies').doc(req.params.id).get()
  if (!cs.exists) return res.status(404).json({ error: 'Company not found' })
  const c = cs.data()
  if (c.status === 'active') return res.status(400).json({ error: 'Company is already active' })

  // Regenerate token + expiry
  const activationToken = genActivationToken()
  const activationExpiry = Date.now() + 1000 * 60 * 60 * 24 * 7
  await db.collection('companies').doc(c.id).update({ activationToken, activationExpiry })

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  const activationLink = `${appUrl}/activate?token=${activationToken}&company=${c.id}`
  let emailSent = false, emailError = null
  try {
    await sgMail.send({
      to: c.contactEmail,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'SyncX Pro' },
      subject: `SyncX Pro — Activate your ${c.name} account`,
      text: `Hi ${c.contactName || 'there'},

Here's your SyncX Pro activation link for ${c.name}:

  Username: ${c.adminUsername}
  Company ID: ${c.id}

${activationLink}

This link expires in 7 days.

— SyncX Pro`,
    })
    emailSent = true
  } catch (e) { emailError = e.message }
  res.json({ success: true, activationLink, emailSent, emailError: emailError || undefined })
}))

// Delete a company (operator). Removes company + admin user; drivers become orphaned
// but their login will fail the company lookup. Use with care.
app.delete('/api/ops/companies/:id', requireOps, asyncHandler(async (req, res) => {
  const cs = await db.collection('companies').doc(req.params.id).get()
  if (!cs.exists) return res.status(404).json({ error: 'Company not found' })
  const c = cs.data()
  if (c.adminUsername) await db.collection('users').doc(c.adminUsername).delete().catch(() => {})
  await db.collection('companies').doc(req.params.id).delete()
  res.json({ success: true })
}))

// ════════════════════════════════════════════════════════════════════════════
// ACTIVATION FLOW (client-facing, no auth — gated by the activation token)
// ════════════════════════════════════════════════════════════════════════════

// Look up an activation token → returns company info + masked phone for the UI
app.get('/api/activate/:token', asyncHandler(async (req, res) => {
  const companyId = (req.query.company || '').toString().toUpperCase()
  if (!companyId) return res.status(400).json({ error: 'Missing company reference' })
  const cs = await db.collection('companies').doc(companyId).get()
  if (!cs.exists) return res.status(404).json({ error: 'Invalid activation link' })
  const c = cs.data()
  if (c.status === 'active') return res.status(400).json({ error: 'This account is already active. Please log in.' })
  if (c.activationToken !== req.params.token) return res.status(403).json({ error: 'Invalid activation link' })
  if (c.activationExpiry && Date.now() > c.activationExpiry) return res.status(410).json({ error: 'This activation link has expired. Please contact SyncX Pro for a new one.' })

  // Mask the phone: +15551234567 -> +1 ••• ••• 4567
  const phone = c.contactPhone || ''
  const masked = phone ? phone.slice(0, 2) + ' ••• ••• ' + phone.slice(-4) : ''
  res.json({
    companyName: c.name, adminUsername: c.adminUsername, companyId: c.id,
    hasPhone: !!phone, maskedPhone: masked,
    phoneVerificationAvailable: twilioConfigured(),
  })
}))

// Step 1 of activation: send SMS verification code to the company's phone
app.post('/api/activate/:token/send-code', limiter, asyncHandler(async (req, res) => {
  const companyId = (req.body.company || '').toString().toUpperCase()
  const cs = await db.collection('companies').doc(companyId).get()
  if (!cs.exists) return res.status(404).json({ error: 'Invalid activation link' })
  const c = cs.data()
  if (c.status === 'active') return res.status(400).json({ error: 'Account already active' })
  if (c.activationToken !== req.params.token) return res.status(403).json({ error: 'Invalid activation link' })
  if (c.activationExpiry && Date.now() > c.activationExpiry) return res.status(410).json({ error: 'Activation link expired' })
  if (!c.contactPhone) return res.status(400).json({ error: 'No phone number on file. Contact SyncX.' })

  const result = await sendVerificationCode(c.contactPhone)
  if (!result.ok) return res.status(502).json({ error: result.reason })
  res.json({ success: true })
}))

// Step 2 of activation: verify code AND set password → activate the account
app.post('/api/activate/:token/complete', limiter, asyncHandler(async (req, res) => {
  const { company, code, password } = req.body
  const companyId = (company || '').toString().toUpperCase()
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const cs = await db.collection('companies').doc(companyId).get()
  if (!cs.exists) return res.status(404).json({ error: 'Invalid activation link' })
  const c = cs.data()
  if (c.status === 'active') return res.status(400).json({ error: 'Account already active' })
  if (c.activationToken !== req.params.token) return res.status(403).json({ error: 'Invalid activation link' })
  if (c.activationExpiry && Date.now() > c.activationExpiry) return res.status(410).json({ error: 'Activation link expired' })

  // Verify the phone code (only if Twilio is configured AND a phone exists)
  if (twilioConfigured() && c.contactPhone) {
    if (!code) return res.status(400).json({ error: 'Verification code is required' })
    const check = await checkVerificationCode(c.contactPhone, code)
    if (!check.ok) return res.status(400).json({ error: check.reason || 'Invalid verification code' })
  }

  // Set the password and activate
  const salt = genSalt()
  const passwordHash = hashPassword(password, salt)
  await db.collection('users').doc(c.adminUsername).update({
    passwordHash, salt, status: 'active',
  })
  await db.collection('companies').doc(companyId).update({
    status: 'active', phoneVerified: !!(twilioConfigured() && c.contactPhone),
    activatedAt: Date.now(),
    activationToken: FieldValue.delete(), // consume the token
  })

  // Log them in immediately
  res.json({ success: true, token: signToken(c.adminUsername), user: {
    username: c.adminUsername, role: 'admin', companyId: c.id, companyName: c.name,
    name: c.name, notifyEmails: c.notifyEmails,
  }})
}))


// ════════════════════════════════════════════════════════════════════════════
// PUBLIC CONTACT / SIGNUP REQUESTS
// Companies submit their info here; it lands in the Ops Portal for review.
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/signup-request', limiter, asyncHandler(async (req, res) => {
  const { companyName, contactName, email, phone, message, fleetSize, intent } = req.body
  if (!companyName?.trim()) return res.status(400).json({ error: 'Company name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!contactName?.trim()) return res.status(400).json({ error: 'Your name is required' })

  const id = randomUUID()
  const request = {
    id,
    companyName: companyName.trim(),
    contactName: contactName.trim(),
    email: email.trim(),
    phone: normalizePhone(phone || ''),
    message: (message || '').trim().slice(0, 2000),
    fleetSize: (fleetSize || '').trim().slice(0, 40), // e.g. "11-25 drivers"
    intent: intent === 'pricing' ? 'pricing' : 'access', // what they asked for
    status: 'new', // new -> converted (once a company is created from it)
    createdAt: Date.now(),
  }
  await db.collection('signupRequests').doc(id).set(request)

  // Notify the operator by email (best-effort)
  try {
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
      const opsEmail = process.env.OPS_NOTIFY_EMAIL || process.env.SENDGRID_FROM_EMAIL
      await sgMail.send({
        to: opsEmail,
        from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'SyncX Pro' },
        subject: `${intent === 'pricing' ? 'Pricing quote request' : 'New SyncX Pro signup request'} — ${companyName.trim()}`,
        text: `A new company has requested to join SyncX Pro:

Company: ${companyName.trim()}
Contact: ${contactName.trim()}
Email: ${email.trim()}
Phone: ${normalizePhone(phone || '') || 'Not provided'}
Fleet size: ${(fleetSize || '').trim() || 'Not provided'}

Message:
${(message || '').trim() || '(none)'}

Log in to the Ops Portal to review and create their account.

— SyncX Pro`,
      })
    }
  } catch (e) { console.error('Signup request notify failed:', e.message) }

  res.json({ success: true })
}))

// Operator: list signup requests
app.get('/api/ops/requests', requireOps, asyncHandler(async (req, res) => {
  const s = await db.collection('signupRequests').orderBy('createdAt', 'desc').get()
  res.json({ requests: s.docs.map(d => d.data()) })
}))

// Operator: mark a request as converted (called after creating a company from it)
app.post('/api/ops/requests/:id/convert', requireOps, asyncHandler(async (req, res) => {
  const ref = db.collection('signupRequests').doc(req.params.id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Request not found' })
  await ref.update({ status: 'converted', convertedAt: Date.now() })
  res.json({ success: true })
}))

// Operator: delete/dismiss a request
app.delete('/api/ops/requests/:id', requireOps, asyncHandler(async (req, res) => {
  await db.collection('signupRequests').doc(req.params.id).delete()
  res.json({ success: true })
}))

// ════════════════════════════════════════════════════════════════════════════
// DRIVER SELF-SIGNUP PHONE VERIFICATION
// A driver using a Company ID must verify their phone via OTP. This is separate
// from admin-created drivers (who are trusted and skip verification).
// ════════════════════════════════════════════════════════════════════════════

// Step 1: driver requests an OTP to their phone before signing up
app.post('/api/auth/driver-send-code', limiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone || '')
  if (!phone || phone.length < 8) return res.status(400).json({ error: 'A valid phone number is required' })
  if (!twilioConfigured()) {
    // If Twilio isn't set up, we can't verify — tell the client clearly.
    return res.status(503).json({ error: 'Phone verification is temporarily unavailable. Please contact your admin.' })
  }
  const result = await sendVerificationCode(phone)
  if (!result.ok) return res.status(502).json({ error: result.reason })
  res.json({ success: true })
}))


// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT REQUESTS
// An admin asks a specific driver for a specific document ("send me the POD for
// load A12345"). The driver sees it waiting, taps it, and the capture flow opens
// with the type and number already filled — they only scan, add location, submit.
// ════════════════════════════════════════════════════════════════════════════

// Admin: create a request for a driver
app.post('/api/company/requests', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })

  const { driverUsername, docType, docNumber, note } = req.body
  if (!driverUsername) return res.status(400).json({ error: 'Choose a driver' })
  if (!docType) return res.status(400).json({ error: 'Choose a document type' })

  // Confirm the driver belongs to this company — never let an admin request
  // from someone else's driver.
  const ds = await db.collection('companies').doc(user.companyId).collection('drivers').doc(driverUsername).get()
  if (!ds.exists) return res.status(404).json({ error: 'That driver is not in your company' })

  const id = randomUUID()
  const request = {
    id,
    companyId: user.companyId,
    driverUsername,
    driverName: ds.data().name || driverUsername,
    docType,
    docNumber: (docNumber || '').trim(),
    note: (note || '').trim().slice(0, 500),
    status: 'pending', // pending -> fulfilled | cancelled
    requestedBy: user.username,
    requestedByTag: actorTag(user),
    createdAt: Date.now(),
  }
  await db.collection('companies').doc(user.companyId).collection('requests').doc(id).set(request)
  res.json({ success: true, request })
}))

// Admin: list requests for the company
app.get('/api/company/requests', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  try {
    const s = await db.collection('companies').doc(user.companyId).collection('requests')
      .orderBy('createdAt', 'desc').get()
    res.json({ requests: s.docs.map(d => d.data()) })
  } catch { res.json({ requests: [] }) }
}))

// Admin: cancel a request
app.delete('/api/company/requests/:id', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  await db.collection('companies').doc(user.companyId).collection('requests').doc(req.params.id).delete()
  res.json({ success: true })
}))

// Driver: what's being asked of me (pending only — fulfilled ones just vanish)
app.get('/api/driver/requests', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'driver') return res.status(403).json({ error: 'Driver only' })
  try {
    const s = await db.collection('companies').doc(user.companyId).collection('requests')
      .where('driverUsername', '==', user.username)
      .where('status', '==', 'pending')
      .get()
    // Sorted in code rather than with orderBy so this needs no composite index.
    const requests = s.docs.map(d => d.data()).sort((a, b) => b.createdAt - a.createdAt)
    res.json({ requests })
  } catch (e) {
    console.error('driver requests:', e.message)
    res.json({ requests: [] })
  }
}))


// ════════════════════════════════════════════════════════════════════════════
// STAFF (department sub-accounts): accounting, dispatch, etc.
// Created by the admin only. Staff log in like anyone else; their actions on
// documents/settlements are attributed by name + department.
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/company/staff', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { username, password, name, department } = req.body
  const uname = (username || '').trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Username: 3-30 characters, letters/numbers/dots/dashes' })
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  if (await getUser(uname)) return res.status(409).json({ error: 'Username already taken' })
  const salt = genSalt()
  const staff = {
    username: uname, passwordHash: hashPassword(password, salt), salt,
    role: 'staff', companyId: user.companyId, companyName: user.companyName,
    name: name.trim(), department: (department || '').trim() || 'Staff',
    createdBy: user.username, createdAt: Date.now(),
  }
  await db.collection('users').doc(uname).set(staff)
  await db.collection('companies').doc(user.companyId).collection('staff').doc(uname)
    .set({ username: uname, name: staff.name, department: staff.department, createdAt: staff.createdAt })
  res.json({ success: true, username: uname })
}))

app.get('/api/company/staff', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  try {
    const s = await db.collection('companies').doc(user.companyId).collection('staff').get()
    res.json({ staff: s.docs.map(d => d.data()).sort((a, b) => a.name.localeCompare(b.name)) })
  } catch { res.json({ staff: [] }) }
}))

app.delete('/api/company/staff/:username', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const uname = req.params.username.toLowerCase()
  const target = await getUser(uname)
  if (!target || target.companyId !== user.companyId || target.role !== 'staff')
    return res.status(404).json({ error: 'Staff member not found' })
  await db.collection('users').doc(uname).delete()
  await db.collection('companies').doc(user.companyId).collection('staff').doc(uname).delete().catch(() => {})
  res.json({ success: true })
}))

// ════════════════════════════════════════════════════════════════════════════
// PAY SETTLEMENTS
// Accounting uploads the settlement PDF (already produced by their payroll —
// SyncX Pro never calculates pay). The pay period auto-advances from the driver's
// previous settlement based on frequency; the driver can query a settlement
// and accounting answers in a comment thread.
// ════════════════════════════════════════════════════════════════════════════

// Advance a period by one cycle. Dates in/out are 'YYYY-MM-DD' strings kept in
// UTC-noon Date objects so timezone shifts can't move a day.
function nextPayPeriod(frequency, prevEndStr) {
  const d = new Date(prevEndStr + 'T12:00:00Z')
  if (isNaN(d)) return null
  const iso = x => x.toISOString().slice(0, 10)
  const addDays = (x, n) => new Date(x.getTime() + n * 86400000)
  const lastOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0, 12))
  if (frequency === 'weekly')  { const s = addDays(d, 1); return { periodStart: iso(s), periodEnd: iso(addDays(s, 6)) } }
  if (frequency === 'biweekly'){ const s = addDays(d, 1); return { periodStart: iso(s), periodEnd: iso(addDays(s, 13)) } }
  if (frequency === 'semimonthly') {
    const y = d.getUTCFullYear(), m = d.getUTCMonth()
    if (d.getUTCDate() <= 15) return { periodStart: iso(new Date(Date.UTC(y, m, 16, 12))), periodEnd: iso(lastOfMonth(y, m)) }
    const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 0 : m + 1
    return { periodStart: iso(new Date(Date.UTC(ny, nm, 1, 12))), periodEnd: iso(new Date(Date.UTC(ny, nm, 15, 12))) }
  }
  if (frequency === 'monthly') {
    const y = d.getUTCFullYear(), m = d.getUTCMonth()
    const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 0 : m + 1
    return { periodStart: iso(new Date(Date.UTC(ny, nm, 1, 12))), periodEnd: iso(lastOfMonth(ny, nm)) }
  }
  return null
}

// Suggest the next period for a driver: their last settlement advanced one
// cycle. Frequency = driver override, else company default, else weekly.
app.get('/api/company/settlements/next-period/:driverUsername', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const dref = db.collection('companies').doc(user.companyId).collection('drivers').doc(req.params.driverUsername)
  const ds = await dref.get()
  if (!ds.exists) return res.status(404).json({ error: 'Driver not found' })
  const cs = await db.collection('companies').doc(user.companyId).get()
  const frequency = ds.data().payFrequency || cs.data()?.payFrequency || 'weekly'
  let suggestion = null
  try {
    const last = await db.collection('companies').doc(user.companyId).collection('settlements')
      .where('driverUsername', '==', req.params.driverUsername).get()
    const latest = last.docs.map(d => d.data()).sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''))[0]
    if (latest?.periodEnd) suggestion = nextPayPeriod(frequency, latest.periodEnd)
  } catch {}
  res.json({ frequency, suggestion }) // suggestion null = first settlement, admin picks
}))

// Upload a settlement (admin or staff)
app.post('/api/company/settlements', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const { driverUsername, amount, depositDate, periodStart, periodEnd, pdf } = req.body
  if (!driverUsername) return res.status(400).json({ error: 'Choose a driver' })
  if (!periodStart || !periodEnd) return res.status(400).json({ error: 'Pay period is required' })
  if (!depositDate) return res.status(400).json({ error: 'Deposit date is required' })
  const amt = parseFloat(amount)
  if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'Enter a valid amount' })
  const ds = await db.collection('companies').doc(user.companyId).collection('drivers').doc(driverUsername).get()
  if (!ds.exists) return res.status(404).json({ error: 'That driver is not in your company' })

  // PDF is required — the settlement document is the point of the feature.
  const m = /^data:(application\/pdf);base64,(.+)$/.exec(pdf || '')
  if (!m) return res.status(400).json({ error: 'Attach the settlement PDF' })
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length < 500) return res.status(400).json({ error: 'That PDF looks empty — please re-attach it' })
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'PDF too large (10 MB max)' })

  const id = randomUUID()
  const storagePath = `settlements/${user.companyId}/${id}.pdf`
  await bucket.file(storagePath).save(buf, { metadata: { contentType: 'application/pdf' } })

  const settlement = {
    id, companyId: user.companyId,
    driverUsername, driverName: ds.data().name || driverUsername,
    amount: amt, depositDate, periodStart, periodEnd,
    storagePath,
    status: 'issued', // issued -> queried -> resolved
    uploadedBy: actorTag(user),
    comments: [],
    createdAt: Date.now(),
  }
  await db.collection('companies').doc(user.companyId).collection('settlements').doc(id).set(settlement)
  res.json({ success: true, settlement: { ...settlement, storagePath: undefined } })
}))

// Sign a fresh 7-day URL per read; stored URLs would expire on old stubs.
async function withPdfUrl(sett) {
  const { storagePath, ...rest } = sett
  try {
    if (storagePath) {
      const [url] = await bucket.file(storagePath).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 })
      return { ...rest, pdfUrl: url }
    }
  } catch (e) { console.error('settlement sign url:', e.message) }
  return rest
}

// Admin/staff: list all settlements
app.get('/api/company/settlements', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  try {
    const s = await db.collection('companies').doc(user.companyId).collection('settlements').get()
    const list = s.docs.map(d => d.data()).sort((a, b) => b.createdAt - a.createdAt)
    res.json({ settlements: await Promise.all(list.map(withPdfUrl)) })
  } catch { res.json({ settlements: [] }) }
}))

// Driver: my settlements only
app.get('/api/driver/settlements', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'driver') return res.status(403).json({ error: 'Driver only' })
  try {
    const s = await db.collection('companies').doc(user.companyId).collection('settlements')
      .where('driverUsername', '==', user.username).get()
    const list = s.docs.map(d => d.data()).sort((a, b) => b.createdAt - a.createdAt)
    res.json({ settlements: await Promise.all(list.map(withPdfUrl)) })
  } catch (e) { console.error('driver settlements:', e.message); res.json({ settlements: [] }) }
}))

// Comment on a settlement. Driver (their own) or admin/staff. A driver comment
// flips status to "queried"; staff replies leave it queried until resolved.
app.post('/api/settlements/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  const text = (req.body.text || '').trim().slice(0, 1000)
  if (!text) return res.status(400).json({ error: 'Write a message first' })
  const ref = db.collection('companies').doc(user.companyId).collection('settlements').doc(req.params.id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Settlement not found' })
  const sett = snap.data()
  const staffSide = isCompanyStaff(user)
  if (!staffSide && sett.driverUsername !== user.username) return res.status(403).json({ error: 'Not permitted' })

  const comment = { id: randomUUID(), text, by: actorTag(user), side: staffSide ? 'office' : 'driver', at: Date.now() }
  const updates = { comments: FieldValue.arrayUnion(comment) }
  if (!staffSide) updates.status = 'queried' // driver asking = open query
  await ref.update(updates)
  res.json({ success: true, comment, status: !staffSide ? 'queried' : sett.status })
}))

// Admin/staff: resolve or reopen a settlement query
app.put('/api/company/settlements/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!isCompanyStaff(user)) return res.status(403).json({ error: 'Not permitted' })
  const status = req.body.status
  if (!['issued', 'queried', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
  await db.collection('companies').doc(user.companyId).collection('settlements').doc(req.params.id)
    .update({ status, statusBy: actorTag(user), statusAt: Date.now() })
  res.json({ success: true })
}))

// Admin only: delete a settlement (uploaded in error)
app.delete('/api/company/settlements/:id', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.auth.username)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const ref = db.collection('companies').doc(user.companyId).collection('settlements').doc(req.params.id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Not found' })
  const path = snap.data().storagePath
  if (path) await bucket.file(path).delete().catch(() => {})
  await ref.delete()
  res.json({ success: true })
}))

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// Central error handler — every asyncHandler-wrapped route funnels errors
// here instead of hanging, so the client always gets a JSON response.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Server error: ' + (err.message || 'unknown') })
})

export default app
