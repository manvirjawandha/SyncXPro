# SyncX Driver — Android app

The driver app is **the same codebase** as the website, built to a separate
bundle and wrapped with Capacitor. `DriverApp.jsx` is shared, so a bug fixed
once is fixed in both places. The admin dashboard, ops portal and marketing site
are never imported into the app build, so they aren't shipped inside it.

```
native/index.html          entry HTML for the app
src/main.driver.jsx        app entry point
src/DriverShell.jsx        driver-only shell (login + DriverApp, nothing else)
src/lib/native.js          camera / GPS / network, with web fallbacks
src/lib/offlineQueue.js    offline capture queue
vite.config.driver.js      builds -> dist-driver/
capacitor.config.json      app id, name, webDir
```

---

## One-time setup

### 0. Install the tools

- **Node 20+**
- **Android Studio** (latest) — includes the Android SDK
- **JDK 21** — Android Studio ships one; no separate install needed

Open Android Studio once and let it finish downloading the SDK before continuing.

### 1. Install the packages

All runtime dependencies (Capacitor plugins + the document scanner) are listed
in `package.json` now, so plain install covers them:

```bash
npm install
npm install @capacitor/android
npm install -D @capacitor/cli
```

(`@capacitor/android` and the CLI are dev/build-time tools, which is why they're
installed separately rather than shipped as app dependencies.)

### 2. Build the driver bundle

```bash
npm run build:driver
```

This produces `dist-driver/`. Confirm `dist-driver/index.html` exists before moving on.

### 3. Generate the Android project

```bash
npx cap add android
```

This creates the `android/` folder — a real Android Studio (Gradle) project.
**Commit it to git**; it's part of your source from now on.

> `capacitor.config.json` is already written, so do **not** run `npx cap init` —
> it would overwrite it.

### 4. Add permissions

Open `android/app/src/main/AndroidManifest.xml` and add these inside `<manifest>`,
above the `<application>` tag:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Camera capture -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />

<!-- GPS stamp on each document -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Choosing an existing photo -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

### 5. Open it and run

```bash
npx cap open android
```

Android Studio opens. Plug in a phone with USB debugging on (or start an
emulator) and press **Run ▶**.

---

## Everyday loop

After **any** change to React code:

```bash
npm run sync:android     # rebuilds the bundle + copies it into android/
```

then press Run in Android Studio. (`sync:android` = `build:driver` + `npx cap sync android`.)

---

## Which server does the app talk to?

The website calls `/api` on its own origin. The app has no origin, so the API
URL is **baked in at build time** — set in `vite.config.driver.js`:

```js
process.env.SYNCX_API_URL || 'https://syncxpro.com'
```

Point it somewhere else for a test build:

```bash
SYNCX_API_URL=https://doc-pro-v2.vercel.app npm run build:driver
```

**Update the default to your real domain before you ship.** If the app can't reach
the API, this is the first thing to check.

---

## The offline queue

This is the feature that makes the app worth installing rather than bookmarking.

- Driver scans a document with no signal → it's written to the phone's private
  storage instead of failing.
- The moment signal returns, it uploads automatically — on app launch and on
  every reconnect. The driver does nothing.
- If signal dies **mid-upload**, the scan is queued rather than lost.
- Pages (base64, several MB) go to the filesystem; only a small index of ids
  lives in Preferences. Putting images in Preferences would break on Android.

Worth testing deliberately: **turn on airplane mode, scan a document, submit,
then turn signal back on** and watch it upload.

---

## The document scanner (ML Kit / VisionKit)

The "Take Photo" button in the app launches the platform's native document
scanner via `@capgo/capacitor-document-scanner`:

- **Android** → Google ML Kit Document Scanner (free, on-device, via Play services)
- **iOS** → Apple VisionKit (free, built into iOS — the same scanner as Notes)

Both give automatic edge detection, perspective correction, and multi-page
capture in one session. Pages come back already cropped and enhanced, so
drivers skip the manual crop/filter steps entirely. "Upload from Gallery"
keeps the manual crop flow (existing photos vary too much to auto-crop).

Things to know:

- **ML Kit does NOT work on Android emulators** — Play services refuses. The
  app detects the failure and silently falls back to the plain camera + manual
  crop, so nothing breaks; you just don't see the scanner UI. Test the scanner
  on a real device only.
- On a **fresh Android install**, Play services downloads the scanner module in
  the background the first time. If a driver taps Scan before it's ready, they
  get the plain-camera fallback that one time.
- iOS caps a scanning session at 24 pages (VisionKit system limit). The app's
  own limit is 20 pages per document, so this never bites.

---

## iOS

The same code runs on iOS — VisionKit replaces ML Kit automatically through the
same plugin. You need a Mac with Xcode (App Store, free).

```bash
npm install @capacitor/ios
npm run build:driver
npx cap add ios
npx cap sync ios
```

Then open `ios/App/App/Info.plist` and add these inside the top-level `<dict>`:

```xml
<key>NSCameraUsageDescription</key>
<string>SyncX Pro scans your paperwork with the camera.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Lets you upload an existing photo of a document.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Stamps each document with where it was scanned.</string>
```

Open and run:

```bash
npx cap open ios
```

Xcode opens. Pick a simulator or a plugged-in iPhone and press Run ▶. (For a
real iPhone you'll need to select your Apple ID under Signing & Capabilities —
a free account works for development.)

After any code change: `npm run build:driver && npx cap sync ios`.

Remember Apple's Guideline 4.2 when you eventually submit: the offline queue,
native scanner, and GPS are the app's answer — a focused field tool, not a
website in a shell.

---

## App icon & splash screen

The icon source files are in `assets/` (generated from `public/icon.svg`):
`icon.png` (1024²), `icon-foreground.png` + `icon-background.png` (Android
adaptive), and `splash.png` / `splash-dark.png`.

One command turns them into every density Android and iOS need:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate
```

That writes all the mipmap/AppIcon files straight into `android/` (and `ios/`
if present). Re-run it if you ever change the icon. Then rebuild:

```bash
npm run sync:android
```

The website favicon and PWA icons are already wired — `public/icon-*.png`,
`favicon.ico`, and `manifest.json` — and deploy with the normal web build.

---

## Shipping to Google Play

1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**
2. Create a keystore when prompted. **Back it up somewhere safe** — lose it and
   you can never update the app under the same listing.
3. Upload the `.aab` at [play.google.com/console](https://play.google.com/console)
   (one-time $25 developer fee).
4. You'll need: app icon, feature graphic, at least two screenshots, a short and
   full description, and a **privacy policy URL** (mandatory — the app requests
   camera and location).

Icons and splash screens can be generated from one source image:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```

Put a 1024×1024 icon at `assets/icon.png` first.

---

## Notes / gotchas

- **`android/` is not in this zip.** It has to be generated by `npx cap add
  android` on your machine (step 3) — it pulls native dependencies that can't be
  hand-written reliably.
- **The website is unaffected.** Every native call falls back to the current web
  behaviour when `isNative()` is false, so `npm run build` and your Vercel
  deploy behave exactly as before.
- **Admins can't use this app.** Signing in with an admin account shows a message
  pointing them to the website. The app is drivers only, by design.
- **iOS later:** the same bundle runs on iOS via `npx cap add ios`, but that
  needs a Mac. Apple's Guideline 4.2 is the real hurdle there — the offline
  queue, native camera and GPS are what make the case that this is a field tool
  and not a website in a shell.
