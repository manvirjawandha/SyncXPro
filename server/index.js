// server/index.js
// Local development entry point.
//
// This imports the EXACT SAME Express app that runs in production on Vercel
// (api/index.js). There used to be a second, separate implementation here
// (Twilio phone/OTP auth) that had drifted out of sync with the real
// frontend (which uses username/password auth) — that's what was causing
// "stuck at creating account" locally: this server had no /api/auth/signup
// route at all. Reusing api/index.js means local dev can never drift from
// production again.
import app from '../api/index.js'

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`✅ DocScan Pro API running on http://localhost:${PORT}`)
})
