// Generate the OPS_PASSWORD_HASH for the SyncX operator login.
//
// Usage:
//   node scripts/generate-ops-password.mjs "YourStrongPassword" "your-salt"
//
// The salt is optional; if omitted it defaults to "syncx-ops". Whatever salt
// you use here MUST match the OPS_SALT env var you set in Vercel.
//
// Output: the OPS_PASSWORD_HASH value to paste into your Vercel env vars.

import { createHash } from 'crypto'

const password = process.argv[2]
const salt = process.argv[3] || 'syncx-ops'

if (!password) {
  console.error('\n  Usage: node scripts/generate-ops-password.mjs "YourPassword" [salt]\n')
  process.exit(1)
}

const hash = createHash('sha256').update(password + salt).digest('hex')

console.log('\n  Set these in your Vercel environment variables:\n')
console.log('  OPS_SALT=' + salt)
console.log('  OPS_PASSWORD_HASH=' + hash)
console.log('\n  (Keep your plaintext password somewhere safe — it is not stored anywhere.)\n')
