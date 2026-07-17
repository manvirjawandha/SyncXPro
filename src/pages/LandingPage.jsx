import { DOC_TYPES } from '../lib/constants'
import { useBreakpoints } from '../lib/useMediaQuery'

// Public marketing site at syncxpro.com — the front door for fleet owners.
// Palette and type deliberately match the product (navy / signal blue / mono for
// document numbers) so the site and the app read as one thing.
const css = `
  .lp-a { color: inherit; text-decoration: none; }
  .lp-navlink { color: rgba(255,255,255,0.6); text-decoration: none; font-size: 14px;
                font-weight: 600; transition: color 140ms ease; }
  .lp-navlink:hover { color: #ffffff; }
  .lp-card { transition: transform 160ms ease, box-shadow 160ms ease; }
  .lp-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(15,23,42,0.10); }
  .lp-cta { transition: transform 120ms ease, filter 120ms ease; }
  .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .lp-rise { animation: lpRise 620ms cubic-bezier(.2,.7,.3,1) both; }
  .lp-rise-2 { animation-delay: 90ms; }
  .lp-rise-3 { animation-delay: 180ms; }
  @keyframes lpRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .lp-rise { animation: none; }
    .lp-card:hover, .lp-cta:hover { transform: none; }
  }
  .lp-focus:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
`

const INK = '#0f172a'
const STEEL = '#1e3a5f'
const SIGNAL = '#1a56db'
const SKY = '#60a5fa'
const SLATE = '#f1f5f9'
const MUTED = '#6b7280'

export default function LandingPage() {
  const { isTablet } = useBreakpoints()
  const pad = isTablet ? '0 32px' : '0 20px'
  const MAX = 1120

  return (
    <div style={{ background: 'white', fontFamily: 'system-ui,sans-serif', color: INK }}>
      <style>{css}</style>

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <header style={{ background: INK, position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: pad, height: 62, display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="/" className="lp-a" style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: -0.4, flexShrink: 0 }}>SyncX Pro</a>
          {isTablet && (
            <nav style={{ display: 'flex', gap: 24, flex: 1 }}>
              <a href="#how" className="lp-navlink">How it works</a>
              <a href="#routing" className="lp-navlink">Routing</a>
              <a href="#requests" className="lp-navlink">Requests</a>
              <a href="#twoway" className="lp-navlink">Why SyncX Pro</a>
              <a href="#pricing" className="lp-navlink">Pricing</a>
              <a href="#features" className="lp-navlink">Features</a>
            </nav>
          )}
          <div style={{ display: 'flex', gap: 10, marginLeft: isTablet ? 0 : 'auto', alignItems: 'center' }}>
            <a href="/login" className="lp-a lp-focus" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Sign in</a>
            <a href="/contact" className="lp-a lp-cta lp-focus" style={{ background: SIGNAL, color: 'white', fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: 10 }}>Request access</a>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(150deg, ${INK} 0%, ${STEEL} 100%)`, color: 'white' }}>
        <div style={{
          maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px 84px' : '48px 20px 56px',
          display: 'grid', gridTemplateColumns: isTablet ? '1.05fr 0.95fr' : '1fr', gap: isTablet ? 56 : 40, alignItems: 'center',
        }}>
          <div className="lp-rise">
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: SKY, marginBottom: 18 }}>
              Document capture for trucking fleets
            </div>
            <h1 style={{
              fontSize: isTablet ? 56 : 36, lineHeight: 1.04, fontWeight: 800, letterSpacing: isTablet ? -1.8 : -1,
              margin: '0 0 20px',
            }}>
              The paperwork beats<br />the truck home.
            </h1>
            <p style={{ fontSize: isTablet ? 18 : 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.68)', margin: '0 0 30px', maxWidth: 460 }}>
              Your driver scans a signed POD at the dock. Sixty seconds later it's a clean,
              cropped PDF sitting in the right inbox — not riding around in the cab until Thursday.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="/contact" className="lp-a lp-cta lp-focus" style={{ background: SIGNAL, color: 'white', fontSize: 15, fontWeight: 700, padding: '14px 24px', borderRadius: 12 }}>
                Request an account
              </a>
              <a href="#how" className="lp-a lp-cta lp-focus" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 15, fontWeight: 700, padding: '14px 24px', borderRadius: 12 }}>
                See how it works
              </a>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 20 }}>
              Accounts are set up by our team — no credit card, no self-serve signup.
            </div>
          </div>

          {/* The product in one image: a scan, its metadata, and where it went. */}
          <div className="lp-rise lp-rise-2" style={{ display: 'flex', justifyContent: isTablet ? 'flex-end' : 'center' }}>
            <ScanCard />
          </div>
        </div>
      </section>

      {/* ── Document types ────────────────────────────────────────────── */}
      <section style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: isTablet ? '30px 32px' : '24px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 16, textAlign: 'center' }}>
            Built for the paperwork you actually run
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {DOC_TYPES.filter(d => d.id !== 'other').map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: SLATE, borderRadius: 20,
                padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#374151',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: d.color }} />
                {d.icon} {d.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works — a real sequence, so it's numbered ──────────── */}
      <section id="how" style={{ background: 'white' }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px' }}>
          <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 10px' }}>
            Three taps at the dock. Nothing back at the office.
          </h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 0 40px', maxWidth: 560, lineHeight: 1.6 }}>
            The driver never types an email, never finds a scanner, never files anything.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(3,1fr)' : '1fr', gap: 20 }}>
            {[
              ['01', 'Scan', 'Driver picks the document type, enters the number, and photographs it. GPS is captured at the same moment — the city and state, not raw coordinates.'],
              ['02', 'Clean', 'Edges are cropped automatically, the page is straightened and filtered, and every page is merged into one PDF. Blank or failed scans are caught before they send.'],
              ['03', 'Route', 'The PDF is emailed to whichever address that document type belongs to — and lands in your dashboard, timestamped and searchable.'],
            ].map(([n, title, body]) => (
              <div key={n} className="lp-card" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: SKY, marginBottom: 14, letterSpacing: 1 }}>{n}</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Signature: routing ────────────────────────────────────────── */}
      <section id="routing" style={{ background: SLATE, borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{
          maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px',
          display: 'grid', gridTemplateColumns: isTablet ? '0.95fr 1.05fr' : '1fr', gap: isTablet ? 56 : 32, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: SIGNAL, marginBottom: 16 }}>
              Every document, its own inbox
            </div>
            <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 16px' }}>
              PODs to billing. Lumpers to accounting. Automatically.
            </h2>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: '0 0 16px' }}>
              Most tools dump every scan into one shared mailbox and leave your staff to sort it.
              SyncX Pro routes each document type to the address that actually handles it — set it once
              in settings and it just runs.
            </p>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Prefer everything in one place? Point them all at a single address instead. Your call.
            </p>
          </div>

          <RoutingFan isTablet={isTablet} />
        </div>
      </section>

      {/* ── Document requests ─────────────────────────────────────────── */}
      <section id="requests" style={{ background: 'white' }}>
        <div style={{
          maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px',
          display: 'grid', gridTemplateColumns: isTablet ? '1.05fr 0.95fr' : '1fr', gap: isTablet ? 56 : 32, alignItems: 'center',
        }}>
          <div style={{ order: isTablet ? 0 : 1 }}>
            <RequestPhone />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: SIGNAL, marginBottom: 16 }}>
              Stop chasing paperwork by phone
            </div>
            <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 16px' }}>
              Need a POD? Request it.<br />It lands on the driver's phone, pre-filled.
            </h2>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: '0 0 16px' }}>
              Billing is waiting on one signed POD and the driver is three states away. Instead of
              calls and texts, send a request from your dashboard — pick the driver, the document
              type, even the document number.
            </p>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              It appears at the top of their app with everything filled in. They tap, scan, submit —
              and your request flips to <b style={{ color: '#166534' }}>received</b> the moment it lands.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section id="features" style={{ background: SLATE, borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px' }}>
          <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 40px' }}>
            What your office gets
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(3,1fr)' : '1fr', gap: 20 }}>
            {[
              ['📍', 'Where it was scanned', 'Every document carries the city and state it was captured in, so you can settle a "where was he" question without a phone call.'],
              ['📄', 'Clean PDFs, not snapshots', 'Auto-crop, straighten, rotate, and filter. Multi-page documents merge into a single PDF with the driver and date on it.'],
              ['✅', 'Review that keeps itself', 'Opening a document marks it reviewed. Flag anything back to pending, and leave notes the driver can read.'],
              ['🚛', 'Driver accounts, two ways', 'Add drivers yourself, or hand out your Company ID and let them register — SMS verification confirms the phone is theirs.'],
              ['🔎', 'Findable later', 'Search by driver, document number, or type. Filter by status. The document you need at 4:55pm on a Friday is two clicks away.'],
              ['🔒', 'Set up by us, not by strangers', 'Company accounts are created by our team and activated by phone verification. Nobody self-registers into your fleet.'],
            ].map(([icon, title, body]) => (
              <div key={title} className="lp-card" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two-way: the differentiator ───────────────────────────────── */}
      <section id="twoway" style={{ background: `linear-gradient(150deg, ${INK} 0%, ${STEEL} 100%)`, color: 'white' }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: SKY, marginBottom: 16 }}>
              Why SyncX Pro
            </div>
            <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 14px' }}>
              Scanner apps are a one-way chute.<br />SyncX Pro talks back.
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: '0 auto', maxWidth: 560 }}>
              Most tools move paper in one direction and stop at an inbox. SyncX Pro runs the
              conversation both ways — between your office and your drivers.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr', gap: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: 26 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: SKY, marginBottom: 16 }}>
                Driver → Office
              </div>
              {[
                ['📄', 'Scans arrive as clean PDFs, routed to the right department'],
                ['📍', 'Every document stamped with where it was captured'],
                ['💬', 'Pay questions asked in-app, on the record — not by voicemail'],
              ].map(([i, t]) => (
                <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{i}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: 26 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: SKY, marginBottom: 16 }}>
                Office → Driver
              </div>
              {[
                ['📨', 'Request a specific document — it lands pre-filled, ready to scan'],
                ['💵', "Pay settlements delivered to the driver's phone, PDF attached"],
                ['✍️', 'Answer pay queries with a note — "added to next settlement" — signed by the department that wrote it'],
              ].map(([i, t]) => (
                <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{i}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              Fewer calls to accounting. Fewer "did you get my POD?" texts. One written record for both sides.
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: 'white', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: isTablet ? '76px 32px' : '52px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: SIGNAL, marginBottom: 16 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 14px' }}>
            Priced per driver. Quoted for your fleet.
          </h2>
          <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: '0 auto 28px', maxWidth: 520 }}>
            One simple per-driver rate — no tiers to decode, no features held back. Every fleet gets
            everything: scanning, routing, requests, the driver app, and unlimited documents.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: isTablet ? 'repeat(3, 1fr)' : '1fr',
            gap: 12, margin: '0 0 30px', textAlign: 'left',
          }}>
            {[
              ['Everything included', 'No feature paywalls — small fleets get the same product as big ones.'],
              ['Scales with your fleet', 'Pay for the drivers you have. Add or remove drivers any time.'],
              ['Set up by us', 'Onboarding, activation, and driver rollout handled with you, not by a help doc.'],
            ].map(([t, b]) => (
              <div key={t} style={{ background: SLATE, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>✓ {t}</div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{b}</div>
              </div>
            ))}
          </div>

          <a href="/contact?intent=pricing" className="lp-a lp-cta lp-focus" style={{ background: SIGNAL, color: 'white', fontSize: 15, fontWeight: 700, padding: '15px 30px', borderRadius: 12, display: 'inline-block' }}>
            Get your quote
          </a>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 14 }}>
            Tell us your fleet size — we'll come back with a number, usually same day.
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(150deg, ${INK} 0%, ${STEEL} 100%)`, color: 'white' }}>
        <div style={{ maxWidth: MAX, margin: '0 auto', padding: isTablet ? '68px 32px' : '48px 20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: isTablet ? 34 : 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 14px' }}>
            Stop waiting on the folder on the dash.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: '0 auto 28px', maxWidth: 480, lineHeight: 1.6 }}>
            Tell us about your fleet and we'll set your company up, generate your logins, and get your drivers scanning.
          </p>
          <a href="/contact" className="lp-a lp-cta lp-focus" style={{ background: SIGNAL, color: 'white', fontSize: 15, fontWeight: 700, padding: '15px 30px', borderRadius: 12, display: 'inline-block' }}>
            Request an account
          </a>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer style={{ background: INK, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          maxWidth: MAX, margin: '0 auto', padding: isTablet ? '28px 32px' : '24px 20px',
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ fontWeight: 800, color: 'white', marginRight: 10 }}>SyncX Pro</span>
            © {new Date().getFullYear()}
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <a href="/login" className="lp-navlink">Sign in</a>
            <a href="/contact" className="lp-navlink">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// The hero object: one scan, its metadata, and proof it already landed.
function ScanCard() {
  return (
    <div style={{
      background: 'white', borderRadius: 18, padding: 18, width: '100%', maxWidth: 340,
      boxShadow: '0 26px 60px rgba(0,0,0,0.42)', transform: 'rotate(-1.4deg)', color: INK,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: '#057a55' }} />
        <span style={{ fontSize: 13, fontWeight: 800 }}>✅ Proof of Delivery</span>
      </div>

      {/* Stand-in for the scanned page */}
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        {[100, 78, 92, 60, 88, 45].map((w, i) => (
          <div key={i} style={{ height: 6, width: `${w}%`, background: i === 0 ? '#cbd5e1' : '#e2e8f0', borderRadius: 3, marginBottom: 8 }} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <div style={{ fontFamily: 'cursive', fontSize: 15, color: '#334155', transform: 'rotate(-4deg)' }}>M. Singh</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: SLATE, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Document #</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>A12345678</div>
        </div>
        <div style={{ background: SLATE, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Location</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Bakersfield, CA</div>
        </div>
      </div>

      <div style={{
        background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13 }}>✓</span>
        <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
          Emailed to <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>pod@company.com</span>
        </span>
      </div>
    </div>
  )
}

// The request feature in one image: what the admin sent, and the same request
// sitting on the driver's phone with everything pre-filled.
function RequestPhone() {
  const pod = DOC_TYPES.find(d => d.id === 'proof_of_delivery') || DOC_TYPES[0]
  return (
    <div style={{ position: 'relative', maxWidth: 400, margin: '0 auto' }}>
      {/* Admin's request card */}
      <div style={{
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px',
        boxShadow: '0 8px 30px rgba(15,23,42,0.08)', marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8 }}>
          You send
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: pod.color, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{pod.icon} {pod.label}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: SIGNAL, fontWeight: 700, marginLeft: 'auto' }}>A12345678</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>To: Marcus S. · "Need this for billing before Friday"</div>
      </div>

      <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 18, margin: '2px 0 12px' }}>↓</div>

      {/* Driver's phone with the request waiting */}
      <div style={{
        background: '#0f172a', borderRadius: 26, padding: 10,
        boxShadow: '0 24px 54px rgba(0,0,0,0.35)', maxWidth: 290, margin: '0 auto',
      }}>
        <div style={{ background: SLATE, borderRadius: 18, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#92400e', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
            📨 Requested from you
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: pod.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>{pod.icon} {pod.label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#4b5563', marginTop: 1 }}>A12345678</div>
            </div>
            <div style={{ background: SIGNAL, color: 'white', borderRadius: 7, padding: '6px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              Scan →
            </div>
          </div>
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
            padding: '8px 10px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ fontSize: 11 }}>✓</span>
            <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>Nothing to type — it's all filled in</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Signature element: the routing table, using the product's real document types.
function RoutingFan({ isTablet }) {
  // Pulled from the product's real document types. Filtered so a renamed id
  // in constants.js drops a row rather than crashing the page.
  const routes = [
    ['proof_of_delivery', 'pod@company.com'],
    ['lumper_receipt', 'accounting@company.com'],
    ['fuel_receipt', 'fuel@company.com'],
    ['bill_of_lading', 'dispatch@company.com'],
    ['osnd', 'claims@company.com'],
  ].map(([id, email]) => [DOC_TYPES.find(d => d.id === id), email])
    .filter(([dt]) => !!dt)

  return (
    <div style={{ background: 'white', borderRadius: 18, padding: isTablet ? 24 : 18, boxShadow: '0 8px 30px rgba(15,23,42,0.08)', border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 16 }}>
        Email routing
      </div>
      {routes.map(([dt, email]) => (
        <div key={dt.id} style={{
          display: 'flex', alignItems: 'center', gap: isTablet ? 12 : 8,
          padding: '12px 0', borderBottom: '1px solid #f1f5f9',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: dt.color, flexShrink: 0 }} />
          <span style={{ fontSize: isTablet ? 14 : 12, fontWeight: 700, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {dt.icon} {dt.label}
          </span>
          <span style={{ color: '#cbd5e1', fontSize: 14, flexShrink: 0 }}>→</span>
          <span style={{ fontSize: isTablet ? 13 : 11, fontFamily: 'monospace', color: SIGNAL, fontWeight: 700, flexShrink: 0 }}>{email}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 14 }}>
        Anything without its own address goes to your default inbox.
      </div>
    </div>
  )
}
