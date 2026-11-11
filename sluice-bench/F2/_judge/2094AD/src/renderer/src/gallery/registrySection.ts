// Gallery registry section (v1, 17 W4-T1): every asset the active theme registers, drawn through the
// same factory the chart uses (`AssetDef.samples`, which builds through `make`), at the sizes its
// adapter picks, cycling through every neutral stage. So what a remix changes in the theme table or
// an adapter shows here first. One section per asset, in the theme's role order. Development only.
import { allAssets } from '../chart/assets/registry';
import type { AssetDef } from '../chart/assets/types';
import '../theme/starChart'; // registers the Star Chart theme (14 §8)
import { activeTheme } from '../theme/registry';
import type { Section } from './types';

/** The roles a registered asset draws, by the active theme's table (`roleAsset`). */
function rolesOf(def: AssetDef): string[] {
  return Object.entries(activeTheme()?.roleAsset ?? {}).filter(([, id]) => id === def.id).map(([role]) => role);
}

export function registrySections(): Section[] {
  const theme = activeTheme(); // registers the theme's assets and binds its roles
  const order = Object.values(theme?.roleAsset ?? {});
  const rank = (def: AssetDef) => (order.includes(def.id) ? order.indexOf(def.id) : order.length);
  return allAssets()
    .filter((def) => def.samples)
    .sort((a, b) => rank(a) - rank(b))
    .map((def) => {
      const caps = (['moving', 'framed', 'flare', 'body'] as const).filter((c) => def[c]);
      const floors = [def.floorPx !== undefined && `floor ${Math.round(def.floorPx)} px`, def.hitFloorPx !== undefined && `hit ${def.hitFloorPx} px`].filter(Boolean);
      const detail = [def.layer, caps.join(' ') || 'static', ...floors, def.acts?.length ? `acts ${def.acts.join(', ')}` : ''].filter(Boolean).join(' · ');
      return {
        key: `registry-${def.id}`,
        title: `Registry · ${rolesOf(def).join(', ') || 'unbound'} → ${def.id} (${theme?.title ?? 'no theme'}) · ${detail}`,
        items: def.samples!(),
        clip: true,
      };
    });
}
