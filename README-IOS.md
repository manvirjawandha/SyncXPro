# SyncX Pro Driver — iOS app

Same codebase as the website and the Android app. `DriverApp.jsx` is shared;
`DriverShell.jsx` imports only the driver screens, so no admin/marketing code
ships in the app. On iOS the document scanner uses Apple's **VisionKit** (the
same scanner as the Notes app) through the same plugin — zero code change from
Android.

You need: a Mac (you have the M5 Air ✓) and **Xcode** from the Mac App Store
(free, ~7 GB — install it first and open it once so it finishes setup).

---

## One-time setup

### 1. Install dependencies

In the project folder:

```bash
npm install
npm install @capacitor/ios
npm install -D @capacitor/cli
```

`@capacitor/ios` is the iOS platform; the CLI is the build tool. (These are
separate from the app dependencies, which `npm install` already pulled in.)

### 2. Build the driver bundle

```bash
npm run build:driver
```

Confirm `dist-driver/index.html` exists before continuing.

### 3. Create the iOS project

```bash
npx cap add ios
```

This scaffolds the `ios/` folder — a real Xcode project — and installs the
native pods. **Commit `ios/` to git**; it's part of your source now.

> `capacitor.config.json` already has the iOS block, so do NOT run
> `npx cap init` — it would overwrite it.

### 4. Add the permission descriptions

iOS **rejects the app at review** if it uses the camera, photos, or location
without explaining why. Open `ios/App/App/Info.plist` in Xcode (or a text
editor) and add these inside the top-level `<dict>`:

```xml
<key>NSCameraUsageDescription</key>
<string>SyncX Pro uses the camera to scan your delivery documents.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>SyncX Pro lets you upload an existing photo of a document.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>SyncX Pro can save scanned documents to your photo library.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>SyncX Pro stamps each scanned document with where it was captured.</string>
```

Write them the way you'd want a reviewer to read them — vague strings ("needs
camera") are a common rejection reason.

### 5. Open in Xcode and run

```bash
npx cap open ios
```

Xcode opens the project. Then:

1. Pick a **simulator** (e.g. iPhone 16) from the device dropdown at the top,
   or plug in a real iPhone.
2. Press the **▶ Run** button.

The simulator boots and installs the app. First build takes a few minutes.

---

## Everyday loop

After **any** change to the React code:

```bash
npm run sync:ios
```

then press Run in Xcode again. (`sync:ios` = `build:driver` + `npx cap sync ios`.)

---

## The simulator vs a real device

- **Login, requests, My Pay, GPS, offline queue** — all testable in the
  simulator.
- **The document scanner (VisionKit) and the camera need a REAL iPhone.** The
  simulator has no camera. The app falls back gracefully, but you can't judge
  scan quality on a simulator.
- GPS in the simulator: **Features → Location → Custom Location** to set
  coordinates.

You don't need a paid Apple Developer account to run on the simulator or on your
own iPhone for testing — a free Apple ID works. You only need the **$99/year
Apple Developer Program** to submit to the App Store (Step below).

---

## Running on your own iPhone (free)

1. Plug the iPhone into the Mac.
2. In Xcode: select the **App** target → **Signing & Capabilities** → check
   **Automatically manage signing** → pick your Apple ID under **Team** (add it
   in Xcode → Settings → Accounts if it's not there).
3. Select your iPhone in the device dropdown and press Run.
4. On the iPhone: **Settings → General → VPN & Device Management** → trust your
   developer certificate the first time.

---

## Which server does the app talk to?

Baked in at build time (`vite.config.driver.js`), currently:

```
https://syncxpro.com
```

The app targets `https://syncxpro.com`.
If login fails but the app opens, this is the first thing to check.

---

## App icon & splash

The icon source files are in `assets/`. One command generates every iOS size:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --ios
```

Then `npm run sync:ios` and rebuild.

---

## Submitting to the App Store (when ready)

1. **$99/year** Apple Developer Program at developer.apple.com.
2. In Xcode: **Product → Archive**, then **Distribute App → App Store Connect**.
3. At appstoreconnect.apple.com: screenshots (6.7" and 6.1" iPhone), description,
   keywords, and a **privacy policy URL** (mandatory — you use camera + location).
4. Fill the **App Privacy** questionnaire: you collect location (tied to
   documents) and user content (the scans). Answer honestly.

### The one real risk: Guideline 4.2 (minimum functionality)

Apple rejects apps that are "just a website in a wrapper." Your defence is
genuine and worth stating plainly in the review notes:

- Works offline — scans queue in dead zones and upload on reconnect
- Native document scanner (VisionKit) with edge detection
- GPS stamping at point of capture
- It's a field tool for drivers, distinct from the web dashboard the office uses

That's a real native app, not a wrapper. Lead with it if they push back.

---

## Notes

- **`ios/` is not in the zip.** It's generated by `npx cap add ios` on your Mac
  (Step 3) — it pulls native pods that can't be hand-written reliably.
- **The website is unaffected.** Every native call falls back to web behaviour
  when not running in the app, so Vercel deploys exactly as before.
- **Admins can't use this app.** Signing in with a company account shows a
  "use the website" message. Drivers only, by design.
