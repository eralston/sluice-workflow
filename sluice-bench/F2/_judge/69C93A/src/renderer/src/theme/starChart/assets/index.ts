// The Star Chart theme's assets (14 §1.4): one adapter per drawn role over the art's own views. Each
// decodes the node's neutral stage into its art's grammar (../stageCodec.ts). Steps, attachments and
// guards are drawn inside their parent's asset; containers aren't drawn (12 §3).
import type { AssetDef } from '../../../chart/assets/types';
import { agentAsset } from './agent';
import { facilityAsset } from './facility';
import { objectiveAsset } from './objective';
import { seatAsset } from './seat';
import { threatAsset } from './threat';

export { agentAsset, facilityAsset, objectiveAsset, seatAsset, threatAsset };

export const assets: AssetDef[] = [seatAsset, objectiveAsset, threatAsset, facilityAsset, agentAsset];
