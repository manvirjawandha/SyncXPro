import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build config for the NATIVE driver app.
//   npm run build:driver   ->  dist-driver/
// Capacitor copies dist-driver/ into the Android (and later iOS) project.
//
// `root: 'native'` makes native/index.html the entry, which means the output is
// dist-driver/index.html — exactly what Capacitor's webDir expects. The website
// build (vite.config.js -> dist/) is untouched and unaffected.
export default defineConfig({
  root: 'native',
  plugins: [react()],
  build: {
    outDir: '../dist-driver',
    emptyOutDir: true,
  },
  // No `base` override needed: Capacitor serves the bundle from a local server
  // (http://localhost on Android, capacitor://localhost on iOS), not file://,
  // so Vite's default absolute asset paths resolve correctly.

  // The website calls /api on its own origin, so VITE_API_URL is empty there.
  // The app has no origin — it MUST call the API absolutely. Baked in here so
  // the two builds can never fight over a single .env value.
  // Override when testing:
  //   SYNCX_API_URL=https://doc-pro-v2.vercel.app npm run build:driver
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.SYNCX_API_URL || 'https://syncxpro.com'
    ),
  },
})
