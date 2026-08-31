import { useEffect, useMemo, useState } from 'react';
import HellbenderGoodStudioReview from '../../../../handoff/hellbender-preview-current/source/HellbenderGoodStudioReview';
import PressClientEstimateEmailHellbender from '../../../../handoff/hellbender-preview-current/source/PressClientEstimateEmailHellbender';
import PressClientEstimateHellbender from '../../../../handoff/hellbender-preview-current/source/PressClientEstimateHellbender';
import PressClientEstimateAcceptedHellbender from '../../../../handoff/hellbender-preview-current/source/PressClientEstimateAcceptedHellbender';
import PressClientNextStepsHellbender from '../../../../handoff/hellbender-preview-current/source/PressClientNextStepsHellbender';
import ArtistDashboardHellbender from '../../../../handoff/hellbender-preview-current/source/ArtistDashboardHellbender';
import ArtistProjectHomeHellbender from '../../../../handoff/hellbender-preview-current/source/ArtistProjectHomeHellbender';
import PressCatalogHellbenderDark from '../../../../handoff/hellbender-preview-current/source/PressCatalogHellbenderDark';
const routeNames = ['PressClientEstimateEmailHellbender', 'PressClientEstimateHellbender', 'PressClientEstimateAcceptedHellbender', 'PressClientNextStepsHellbender', 'ArtistDashboardHellbender', 'ArtistProjectHomeHellbender', 'PressCatalogHellbenderDark'] as const;
type Route = typeof routeNames[number];

export function HellbenderPreviewRouter() {
  const getRoute = () => (window.location.hash.replace(/^#\//, '') as Route);
  const [route, setRoute] = useState<Route | ''>(getRoute());
  useEffect(() => { const update = () => setRoute(getRoute()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const page = useMemo(() => {
    if (!route) return null;
    const pages = {
      PressClientEstimateEmailHellbender: <PressClientEstimateEmailHellbender />,
      PressClientEstimateHellbender: <PressClientEstimateHellbender />,
      PressClientEstimateAcceptedHellbender: <PressClientEstimateAcceptedHellbender />,
      PressClientNextStepsHellbender: <PressClientNextStepsHellbender />,
      ArtistDashboardHellbender: <ArtistDashboardHellbender />,
      ArtistProjectHomeHellbender: <ArtistProjectHomeHellbender />,
      PressCatalogHellbenderDark: <PressCatalogHellbenderDark />,
    };
    return pages[route] ?? null;
  }, [route]);
  if (!page) return <HellbenderGoodStudioReview />;
  return (
    <>
      {page}
      <a
        href="/hellbender-preview"
        style={{
          position: 'fixed',
          left: 18,
          bottom: 18,
          zIndex: 10000,
          border: '1px solid rgba(0,0,0,.16)',
          borderRadius: 999,
          background: 'rgba(255,255,255,.94)',
          boxShadow: '0 8px 24px rgba(0,0,0,.14)',
          color: '#1d1d1f',
          fontFamily: "'Chivo', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.02em',
          padding: '10px 15px',
          textDecoration: 'none',
        }}
      >
        Review gallery
      </a>
    </>
  );
}
export default HellbenderPreviewRouter;