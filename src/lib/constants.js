// src/lib/constants.js
export const DOC_TYPES = [
  { id: "bill_of_lading",    label: "Bill of Lading",          icon: "📦", color: "#1a56db" },
  { id: "freight_bill",      label: "Freight Bill",            icon: "🧾", color: "#0e9f6e" },
  { id: "trip_cost_report",  label: "Trip Cost Report",        icon: "✉️", color: "#7e3af2" },
  { id: "fuel_receipt",      label: "Fuel Receipt",            icon: "⛽", color: "#e3a008" },
  { id: "lumper_receipt",    label: "Lumper Receipt",          icon: "🏗️", color: "#ff5a1f" },
  { id: "proof_of_delivery", label: "Proof of Delivery",       icon: "✅", color: "#057a55" },
  { id: "weight_ticket",     label: "Weight Tag/Scale Ticket", icon: "⚖️", color: "#0891b2" },
  { id: "osnd",              label: "OS&D",                    icon: "⚠️", color: "#e02424" },
  { id: "other",             label: "Other",                   icon: "📄", color: "#6b7280" },
]
export const DOC_TYPE_FALLBACK = DOC_TYPES[DOC_TYPES.length - 1]
export function getDocType(id) {
  return DOC_TYPES.find(t => t.id === id) || DOC_TYPE_FALLBACK
}

export const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "India", "Australia",
  "Germany", "France", "Mexico", "Brazil", "UAE", "Saudi Arabia", "Pakistan", "Other",
]

export const S = {
  btn: (bg, x = {}) => ({ flex: 1, padding: "13px 16px", background: bg, color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", ...x }),
  card: (x = {}) => ({ background: "white", borderRadius: 16, padding: 20, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", ...x }),
  input: { width: "100%", padding: "13px 15px", borderRadius: 12, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", background: "#f9fafb", boxSizing: "border-box", fontFamily: "inherit" },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 },
  page: { padding: "16px 16px 100px" },
}


// ── Money ────────────────────────────────────────────────────────────────────
// Currencies a fleet can be paid in. This is a labelling choice only —
// SyncX Pro never converts between currencies.
export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)', symbol: '$' },
  { code: 'MXN', label: 'Mexican Peso (MXN)', symbol: '$' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'AUD', label: 'Australian Dollar (AUD)', symbol: '$' },
]

// Format an amount in the currency the settlement was actually issued in.
// Falls back to USD for settlements created before currency existed.
export function formatMoney(amount, currency = 'USD') {
  if (amount === undefined || amount === null || isNaN(amount)) return '—'
  try {
    return Number(amount).toLocaleString('en-US', {
      style: 'currency', currency: currency || 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
  } catch {
    // Unknown code — still show the number rather than breaking the page.
    return `${Number(amount).toFixed(2)} ${currency || ''}`.trim()
  }
}
