# DocScan Pro — Fleet Document Management

Production-ready document scanning app for trucking companies. Drivers scan and submit Bill of Ladings, Freight Bills, PODs, and more — admins review them and get notified by email instantly.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Node.js + Express (single implementation in `api/index.js`, used both locally and on Vercel) |
| Auth | Username + password, JWT sessions (30 days) |
| Database | Firebase Firestore |
| File Storage | Firebase Cloud Storage |
| Email | SendGrid + Claude (Anthropic API) for AI-generated email copy |
| Hosting | Vercel (or any Node host) |

---

## 1. Prerequisites

You'll need accounts (all have free tiers to start):

- [Firebase](https://console.firebase.google.com) — for database + file storage
- [SendGrid](https://sendgrid.com) — for sending emails
- [Anthropic](https://console.anthropic.com) — for AI-generated email bodies
- [Vercel](https://vercel.com) — for hosting (or use Railway/Render/your own server)

---

## 2. Local Setup

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in every value — see section 3 below for where to get each one.

```bash
npm run dev
```

This starts the Vite frontend (port 3000) and Express backend (port 4000) together.
`server/index.js` simply imports and runs the exact same app defined in `api/index.js`
that Vercel runs in production — there's only one backend implementation, so local
dev behavior always matches what's deployed.

Once it's running, hit `http://localhost:4000/api/health` — it reports whether Firebase
is actually configured (`firebaseConfigured: true/false`). If sign-up hangs or fails,
check this endpoint first.

---

## 3. Getting Your Credentials

### Firebase (Database + Storage)
1. Go to [Firebase Console](https://console.firebase.google.com) → **Create a project**
2. Enable **Firestore Database** (production mode) and **Storage**
3. Go to **Project Settings → Service Accounts → Generate new private key** — downloads a JSON file
4. Open that JSON file, copy its **entire contents as one line**, paste as `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`
5. Find your storage bucket name in **Project Settings → General** (looks like `your-project.appspot.com`) → paste as `FIREBASE_STORAGE_BUCKET`
## 4.5 Deploy Firebase Security Rules (Important!)

After setting up your Firebase project, **you MUST deploy the security rules** or your app won't work properly:

```bash
npm install -g firebase-tools  # if not already installed
firebase login                  # sign in with your Google account
firebase init                   # (skip — your project already has rules files)
firebase deploy --only firestore:rules,storage
```

This deploys:
- **`firestore.rules`** — Who can read/write database documents
- **`storage.rules`** — Who can access file storage (now requires authentication)

You'll see output like:
```
✔ Rules updated in Cloud Firestore
✔ Rules updated in Cloud Storage for Firebase
```

If you skip this step, your bucket remains public (security issue) and Firebase might not enforce the intended access controls.

> **Common gotcha:** when pasting the service account JSON into Vercel's environment
> variable UI, make sure the private key's `\n` characters survive the paste intact.
> If they get mangled, `FIREBASE_SERVICE_ACCOUNT_JSON` will fail to parse and
> `/api/health` will show `firebaseConfigured: false` with the parse error.

### SendGrid (Email)
1. Sign up at sendgrid.com → **Settings → API Keys → Create API Key** (Full Access)
2. Paste into `.env` as `SENDGRID_API_KEY`
3. **Settings → Sender Authentication** → verify a sender email or domain (required before sending)
4. Set `SENDGRID_FROM_EMAIL` to that verified address

### Anthropic (AI Email Generation)
1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys → Create Key**
2. Paste into `.env` as `ANTHROPIC_API_KEY`

### JWT Secret
Generate a random secret for signing login sessions:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Paste the output as `JWT_SECRET`.

---

## 4. Deploying to Production

### Option A — Vercel (recommended, easiest)

```bash
npm install -g vercel
vercel login
vercel
```

When prompted, add all the same environment variables from your `.env` file, one at a time:
```bash
vercel env add JWT_SECRET
vercel env add FIREBASE_SERVICE_ACCOUNT_JSON
vercel env add FIREBASE_STORAGE_BUCKET
vercel env add SENDGRID_API_KEY
vercel env add SENDGRID_FROM_EMAIL
vercel env add SENDGRID_FROM_NAME
vercel env add ANTHROPIC_API_KEY
```
Or paste them all at once in **Vercel Dashboard → Project → Settings → Environment Variables**.

`vercel.json` rewrites every `/api/:path*` request to `api/index.js`, so all routes
(`/api/auth/signup`, `/api/documents`, etc.) are handled by that one file.

Then deploy to production:
```bash
vercel --prod
```

Your app will be live at `https://your-project.vercel.app` — works on every device automatically.

### Option B — Railway / Render (if you prefer a persistent Node server)

1. Push this repo to GitHub
2. Connect the repo on [railway.app](https://railway.app) or [render.com](https://render.com)
3. Set the build command: `npm install && npm run build`
4. Set the start command: `npm start`
5. Add all environment variables in their dashboard
6. Deploy

### Option C — Your own VPS

```bash
npm install
npm run build
NODE_ENV=production npm start
```
Put Nginx or Caddy in front for HTTPS (required for camera access on mobile browsers).

---

## 5. Post-Launch Checklist

- [ ] Verify your SendGrid sender domain (improves deliverability, avoids spam folder)
- [ ] Set Firestore to production mode with the provided `firestore.rules`
- [ ] Check `/api/health` on your production URL and confirm `firebaseConfigured: true`
- [ ] Test the full flow: sign up as Admin, get Company ID, sign up as Driver, submit a document, confirm the email arrives
- [ ] Set up Firebase budget alerts (Firestore/Storage have generous free tiers, but monitor usage)
- [ ] Consider adding Sentry or LogRocket for error tracking in production
- [ ] Add a custom domain in Vercel (Settings → Domains)

---

## 6. Architecture Notes

**Why a backend instead of calling Firebase directly from the browser?**
SendGrid and Anthropic API keys must never be exposed in client-side code — anyone could read them from browser devtools and rack up charges on your account. The Express backend keeps all secrets server-side and only exposes safe, authenticated REST endpoints to the frontend.

**Auth:**
Sign-up/login use a username + password. Passwords are salted and hashed server-side
before being stored in Firestore; the server issues a JWT on successful signup/login,
which the frontend stores and sends as `Authorization: Bearer <token>` on every
subsequent request. Sessions last 30 days.

**Image storage:**
Document photos are uploaded as base64 from the browser, decoded server-side, and stored in Firebase Cloud Storage as JPEG files. Each document's pages are also combined server-side into a single PDF (via `pdf-lib`) which is emailed to the admin and stored alongside the images. Firestore stores URLs, not raw image bytes — keeps documents fast to load and Firestore costs low.

**Error handling:**
Every route in `api/index.js` is wrapped in an `asyncHandler` so thrown errors (e.g. a
misconfigured Firebase connection) always return a clear JSON error instead of leaving
the request hanging. A dedicated middleware also checks that Firebase initialized
successfully before allowing any request past `/api/health` through.

---

## Security Model

**Firebase Storage** is now **private by default** — all document images and PDFs require authentication to access. The system uses signed URLs:

1. When a driver uploads a document, the backend generates a **signed URL** valid for **7 days**
2. These URLs are stored in Firestore (Firestore queries still require database auth)
3. After 7 days, links expire and images can't be viewed without re-uploading
4. Only logged-in users can access documents (Firebase Auth rules enforce this)

**Storage rules** (in `storage.rules`):
- ✅ Only authenticated users can read files
- ✅ Only the backend (Admin SDK) can write — frontend can't upload directly
- ✅ No public bucket access

This prevents:
- Unauthorized users from guessing URLs and viewing sensitive documents
- Crawlers from indexing your bucket
- Accidental public exposure of bill of ladings, PODs, etc.

---

```
docscan-pro/
├── src/                    # React frontend
│   ├── components/         # Reusable UI (ScannedDoc, CropEditor, Toast, etc.)
│   ├── pages/               # LoginScreen, AdminDashboard, DriverApp
│   ├── lib/                 # api.js (backend client), constants, image utils
│   └── App.jsx
├── api/
│   └── index.js              # The one and only backend — Express app with
│                              # auth, users, company, and documents routes.
│                              # Runs as a Vercel serverless function in prod.
├── server/
│   └── index.js               # Local dev entry point — just imports api/index.js
│                               # and calls .listen(), so local == production.
├── firestore.rules
├── storage.rules
├── vercel.json
└── .env.example
```
