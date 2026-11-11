// The v1 gallery sections Gallery.tsx appends (17 W4-T1): the asset registry, drawn through the
// theme's factories, the looping maneuver demos (HG-V3′), the Arrive/Depart row and finale cell (v1.3 F7, F8), and the label hierarchy (19 §2, HG-L1). One entry point, so the gallery itself
// changes by a line and a remix adds its sections here. Development only.
import { labelSections } from './labelHierarchy';
import { maneuverSections } from './maneuverDemos';
import { motionSections } from './motionDemos';
import { registrySections } from './registrySection';
import type { Section } from './types';

export function extraSections(): Section[] {
  return [...labelSections(), ...maneuverSections(), ...motionSections(), ...registrySections()];
}
