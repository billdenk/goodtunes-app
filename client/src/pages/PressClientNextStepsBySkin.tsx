// Task #3423 — per-press client entrance resolution. Each press's white-label
// subdomain mounts its OWN gate/portal screens, keyed off the data-driven
// client_portal_skin identifier the branding payload carries (NEVER a
// press-name string check). A press with no skin has no client entrance yet:
// /next-steps redirects home, and the landing keeps its neutral fallback.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";
import PressClientNextStepsMRP from "@/pages/mrp/PressClientNextStepsMRP";
import PressClientNextStepsPMPThemed from "@/pages/pmp/PressClientNextStepsPMPThemed";
import PressClientNextStepsCinq from "@/pages/cinq/PressClientNextStepsCinq";
import PressClientNextStepsHellbender from "@/pages/hellbender/PressClientNextStepsHellbender";

export const SKIN_COMPONENTS: Record<string, React.ComponentType> = {
  "mrp-light": PressClientNextStepsMRP,
  pmp: PressClientNextStepsPMPThemed,
  cinq: PressClientNextStepsCinq,
  hellbender: PressClientNextStepsHellbender,
};

export default function PressClientNextStepsBySkin() {
  const { brand, isLoading } = useWhitelabelBrand();
  const [, navigate] = useLocation();
  const Comp = brand?.skin ? SKIN_COMPONENTS[brand.skin] : undefined;
  const blocked = !isLoading && !Comp;
  useEffect(() => {
    if (blocked) navigate("/", { replace: true });
  }, [blocked, navigate]);
  if (isLoading || !Comp) return null;
  return <Comp />;
}
