// Task #3423 — PMP's client entrance is theme-aware: the handoff ships a
// light canon file and a Dark twin (identical structure, flipped palette).
// The visitor's OS preference picks the twin, live — no reload needed.
import { useEffect, useState } from 'react';
import PressClientNextStepsPMP from './PressClientNextStepsPMP';
import PressClientNextStepsPMPDark from './PressClientNextStepsPMPDark';

export default function PressClientNextStepsPMPThemed() {
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark ? <PressClientNextStepsPMPDark /> : <PressClientNextStepsPMP />;
}
