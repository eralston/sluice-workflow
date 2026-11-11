// The SDLC domain pack (14 §1.2, 12): Azure DevOps work, read in engine terms. Its mapping is
// config/state-mapping.json, which every SDLC bundle carries as its own `stateMapping`, so the pack
// doesn't ship one. SDLC bundles never name their pack (AC-27): an unnamed bundle is read by this
// one. Pure.
import type { DomainPack } from '../../engine/types';
import { sdlcAdapter } from './adapter';
import { containerUrl } from './links';
import { SDLC_THRESHOLDS } from './thresholds';
import { SDLC_WORDS } from './words';

export const sdlcPack: DomainPack = {
  id: 'sdlc',
  title: 'Software delivery (Azure DevOps)',
  words: SDLC_WORDS,
  adapter: sdlcAdapter,
  thresholds: SDLC_THRESHOLDS,
  containerUrl,
};
