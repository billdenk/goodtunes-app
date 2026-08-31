import hellbenderLogo from '../assets/hellbender-full.svg';
import type { CSSProperties } from 'react';

export type GoodStudioReviewScreen = {
  route: string;
  eyebrow: string;
  title: string;
  note: string;
};

const MOCK_SCREENS: GoodStudioReviewScreen[] = [
  {
    route: 'PressClientEstimateEmailHellbender',
    eyebrow: '01 · Invitation',
    title: 'Email. Open the estimate.',
    note: 'The private estimate link that brings the artist into the project.',
  },
  {
    route: 'PressClientEstimateHellbender',
    eyebrow: '02 · Review',
    title: 'Estimate. Review the production plan.',
    note: 'The complete estimate, pricing, and project decision.',
  },
  {
    route: 'PressClientEstimateAcceptedHellbender',
    eyebrow: '03 · Confirmation',
    title: 'Accepted. Continue into the project.',
    note: 'The confirmation moment after the artist starts the project.',
  },
  {
    route: 'PressClientNextStepsHellbender',
    eyebrow: '04 · Account',
    title: 'Next steps. Enter the working portal.',
    note: 'The handoff from an accepted estimate into the working portal.',
  },
  {
    route: 'ArtistDashboardHellbender',
    eyebrow: '05 · Portal',
    title: 'Dashboard. See what needs attention.',
    note: 'The artist’s home for project status and next actions.',
  },
  {
    route: 'ArtistProjectHomeHellbender',
    eyebrow: '06 · Project',
    title: 'Project. Keep the work moving.',
    note: 'The working project view for How???.',
  },
  {
    route: 'PressCatalogHellbenderDark',
    eyebrow: '07 · Press operations',
    title: 'Builder. Prepare the package.',
    note: 'The pre-conversion workspace for the package an artist agrees to build.',
  },
];

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

export function PressGoodStudioReview({
  pressName,
  logo,
  logoAlt,
  logoStyle,
  accent,
  background,
  font,
  description,
  screens,
}: {
  pressName: string;
  logo: string;
  logoAlt: string;
  logoStyle: CSSProperties;
  accent: string;
  background: string;
  font: string;
  description: string;
  screens: GoodStudioReviewScreen[];
}) {
  const RED = accent;
  const INK = '#171717';
  const SUBINK = '#666666';
  const HAIRLINE = 'rgba(0,0,0,0.12)';
  return (
    <div style={{ minHeight: '100dvh', background, color: INK, fontFamily: font }}>
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
        <img src={logo} alt={logoAlt} style={logoStyle} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK }}>
          GoodTunes® review
        </div>
      </header>

      <main className="hb-review-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '82px 42px 100px' }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: RED }}>
            {pressName} × GoodTunes®
          </div>
          <h1 className="hb-review-title" style={{ margin: '16px 0 0', fontSize: 58, lineHeight: 0.98, letterSpacing: -2.4, fontWeight: 700 }}>
            Samples. <span style={{ color: SUBINK, fontWeight: 400 }}>Artist experience.</span>
          </h1>
          <p style={{ margin: '24px 0 0', maxWidth: 680, fontSize: 18, lineHeight: 1.55, color: SUBINK }}>
            {description}
          </p>
        </div>

        <div
          className="hb-review-grid"
          style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 22 }}
        >
          {screens.map((screen) => (
            <a
              key={screen.route}
              href={`#/${screen.route}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hb-review-card"
              style={{
                display: 'block',
                overflow: 'hidden',
                color: INK,
                background: '#ffffff',
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 16,
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
          Prepared for {pressName} by GoodTunes®
        </footer>
      </main>
    </div>
  );
}

export default function HellbenderGoodStudioReview() {
  return (
    <PressGoodStudioReview
      pressName="Hellbender Vinyl"
      logo={hellbenderLogo}
      logoAlt="Hellbender Vinyl"
      logoStyle={{ width: 260, maxHeight: 54 }}
      accent="#DF0C15"
      background="#f5f5f3"
      font="'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
      description="A review of the Hellbender artist experience, from email estimate to project."
      screens={MOCK_SCREENS}
    />
  );
}