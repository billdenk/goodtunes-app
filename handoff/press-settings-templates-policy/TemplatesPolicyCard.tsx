// TemplatesPolicyCard — per-press policy toggle for the press Settings page.
// Drops in below the "Press profile" card. Copied verbatim from the Playground
// settings mock (dark tokens inline); map the token consts to the settings
// page's own THEMES vars when wiring — both themes required (Bill's rule).
//
// Policy (Bill, Aug 15 2026): whether a template must pass a live test before
// it can measure client files is a per-press call, made here — not a platform
// rule. Off = usable on Save; certification is optional proof (it happens
// automatically when a finished file passes a test).

import { useState } from 'react';

const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const BLUE = '#319ED8';
const PANEL = '#1e1e1f';
const TILE = '#2a2a2d';
const HAIRLINE = 'rgba(255,255,255,0.08)';

const MOCK_DEFAULT_REQUIRE_TEST = false; // wire to the press's saved setting

export default function TemplatesPolicyCard() {
  const [requireTest, setRequireTest] = useState(MOCK_DEFAULT_REQUIRE_TEST);
  return (
    <div className="mt-5 rounded-xl overflow-hidden" style={{ backgroundColor: PANEL, border: `1px solid ${HAIRLINE}` }}>
      <div className="px-6 pt-5 pb-6">
        <h3 className="text-[15px] font-semibold" style={{ color: INK }}>Templates</h3>
        <p className="text-[12.5px] mt-0.5" style={{ color: SUBINK }}>
          How new press templates go live for measuring client files.
        </p>
        <div className="mt-5 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium" style={{ color: INK }}>Require a passing test before a template goes live</div>
            <p className="text-[12.5px] mt-1 max-w-[560px]" style={{ color: FAINT }}>
              {requireTest
                ? 'On — a saved template stays Pending until a finished file passes a live test against it. Client files are only measured by certified templates.'
                : 'Off — a template is usable the moment you save it. Certification is optional proof: it happens automatically when a finished file passes a test.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireTest}
            onClick={() => setRequireTest((v) => !v)}
            className="flex-shrink-0 inline-flex items-center gap-2"
            data-testid="toggle-require-test"
          >
            <span className="text-[12px] font-semibold" style={{ color: requireTest ? INK : FAINT }}>{requireTest ? 'On' : 'Off'}</span>
            <span className="relative inline-flex items-center rounded-full transition-colors" style={{ width: 44, height: 26, backgroundColor: requireTest ? BLUE : TILE, border: `1px solid ${HAIRLINE}` }}>
              <span className="absolute rounded-full bg-white transition-all" style={{ width: 20, height: 20, top: 2, left: requireTest ? 21 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
