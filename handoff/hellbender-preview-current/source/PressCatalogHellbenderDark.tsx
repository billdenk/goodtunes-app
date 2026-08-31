// Legacy route retained for launcher compatibility. Package creation is
// deliberately sourced only from PressPackageBuilder.
import { PressPackageBuilder } from './PressPackageBuilder';

export function PressCatalogHellbenderDark() {
  return <PressPackageBuilder variant="hellbender" />;
}

export function PressCatalogParamountPackageBuilder() {
  return <PressPackageBuilder variant="paramount" />;
}

export default PressCatalogHellbenderDark;