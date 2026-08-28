import hellbenderLogo from '../assets/hellbender-full.svg';

const RED = '#DF0C15';
const INK = '#171717';
const SUBINK = '#666666';
const HAIRLINE = 'rgba(0,0,0,0.12)';
const FONT = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const MOCK_SCREENS = [
  {
    route: 'PressClientEstimateEmailHellbender',
    eyebrow: '01 · Invitation',
    title: 'Estimate email',
    note: 'The email that brings the artist into the estimate.',
  },
  {
    route: 'PressClientEstimateHellbender',
    eyebrow: '02 · Review',
    title: 'Client estimate',
    note: 'The complete estimate, pricing and project decision.',
  },
  {
    route: 'PressClientEstimateAcceptedHellbender',
    eyebrow: '03 · Confirmation',
    title: 'Project accepted',
    note: 'The confirmation moment after the artist starts the project.',
  },
  {
    route: 'PressClientNextStepsHellbender',
    eyebrow: '04 · Account',
    title: 'Sign in and next steps',
    note: 'The handoff from accepted estimate into the working portal.',
  },
  {
    route: 'ArtistDashboardHellbender',
    eyebrow: '05 · Portal',
    title: 'Artist dashboard',
    note: 'The artist’s home, project status and next actions.',
  },
  {
    route: 'ArtistProjectHomeHellbender',
    eyebrow: '06 · Project',
    title: 'Project home',
    note: 'The working project view for How???.',
  },
  {
    route: 'PressCatalogHellbenderDark',
    eyebrow: '07 · Press operations',
    title: 'Product catalog',
    note: 'Hellbender’s product and pricing catalog inside GoodTunes®.',
  },
] as const;

const MOCK_THUMBS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/thumbs/route-*.jpg', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [
    path.replace(/^.*route-/, '').replace(/\.jpg$/, ''),
    url as string,
  ]),
) as Record<string, string>;

export default function HellbenderGoodStudioReview() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f3', color: INK, fontFamily: FONT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        .hb-review-card { transition: transform 180ms ease, box-shadow 180ms ease; }
        .hb-review-card:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,.09); }
        .hb-review-card:focus-visible { outline: 3px solid ${RED}; outline-offset: 3px; }
        @media (max-width: 720px) {
          .hb-review-header { padding: 24px 20px !important; }
          .hb-review-main { padding: 56px 20px 72px !important; }
          .hb-review-grid { grid-template-columns: 1fr !important; }
          .hb-review-title { font-size: 42px !important; }
        }
      `}</style>

      <header
        className="hb-review-header"
        style={{
          height: 84,
          padding: '0 42px',
          background: '#ffffff',
          borderBottom: `1px solid ${HAIRLINE}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ width: 190, maxHeight: 46 }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK }}>
          GoodTunes® review
        </div>
      </header>

      <main className="hb-review-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '82px 42px 100px' }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: RED }}>
            Hellbender Vinyl × GoodTunes®
          </div>
          <h1 className="hb-review-title" style={{ margin: '16px 0 0', fontSize: 58, lineHeight: 0.98, letterSpacing: -2.4, fontWeight: 700 }}>
            Your GoodTune<span style={{ position: 'relative', display: 'inline-block' }}>s<sup style={{ position: 'absolute', left: '100%', top: '0.18em', marginLeft: '0.08em', fontSize: '0.25em', lineHeight: 1, letterSpacing: 0 }}>®</sup></span> Journey
          </h1>
          <p style={{ margin: '24px 0 0', maxWidth: 680, fontSize: 18, lineHeight: 1.55, color: SUBINK }}>
            A working preview of the Hellbender experience, from the first estimate email through the artist portal and press catalog.
          </p>
        </div>

        <div
          className="hb-review-grid"
          style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 22 }}
        >
          {MOCK_SCREENS.map((screen) => (
            <a
              key={screen.route}
              href={`#/${screen.route}`}
              className="hb-review-card"
              style={{
                display: 'block',
                overflow: 'hidden',
                color: INK,
                background: '#ffffff',
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 0,
                textDecoration: 'none',
              }}
              data-testid={`review-${screen.route}`}
            >
              <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', background: '#e9e9e6', borderBottom: `1px solid ${HAIRLINE}` }}>
                {MOCK_THUMBS[screen.route] ? (
                  <img
                    src={MOCK_THUMBS[screen.route]}
                    alt=""
                    aria-hidden
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                  />
                ) : null}
              </div>
              <div style={{ padding: '24px 26px 27px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: RED }}>
                  {screen.eyebrow}
                </div>
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 18 }}>
                  <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, letterSpacing: -0.4 }}>{screen.title}</h2>
                  <span aria-hidden style={{ color: RED, fontSize: 18 }}>→</span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: SUBINK }}>{screen.note}</p>
              </div>
            </a>
          ))}
        </div>

        <footer style={{ marginTop: 54, paddingTop: 24, borderTop: `1px solid ${HAIRLINE}`, fontSize: 12.5, lineHeight: 1.6, color: SUBINK }}>
          Prepared for Hellbender Vinyl by GoodTunes® · August 2026
        </footer>
      </main>
    </div>
  );
}