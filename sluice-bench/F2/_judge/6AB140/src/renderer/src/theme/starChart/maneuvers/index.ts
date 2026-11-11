// The Star Chart theme's choreographies (13 §6): one per engine rule id (src/shared/engine/pace.ts).
// To remix a maneuver, edit its file; to play a different one for a rule, swap the entry here. Haul
// has no rule of its own: it plays inside Rig up.
//
//   piece.appear          Sensor contact         objective.accomplish  Landing
//   threat.emerge         Hyperspace emergence   threat.engage         Engage
//   objective.underway    Carve                  threat.accomplish     Strike run
//   objective.nearing     Rig up (+ Haul)        piece.off             Warp out
//   piece.reseat          Reassign               facility.enter        Station jump-in
//   attachment.open       Shuttle tender         attachment.settle     Satellite cycle
//   attachment.merge      Power link             agent.light           Captain jump
//   seat.complete         Homeworld complete     region.clear          All clear
//   agent.progress        Progress beam         region.sweep          Sector sweep
import type { ManeuverDef } from '../../../chart/fx/types';
import { captainJump } from './captainJump';
import { carve } from './carve';
import { emergence } from './emergence';
import { engage } from './engage';
import { landing } from './landing';
import { powerLink } from './powerLink';
import { progressBeam } from './progressBeam';
import { reassign } from './reassign';
import { regionClear } from './regionClear';
import { rigUp } from './rigUp';
import { sectorSweep } from './sectorSweep';
import { satelliteCycle } from './satelliteCycle';
import { seatComplete } from './seatComplete';
import { sensorContact } from './sensorContact';
import { shuttleTender } from './shuttleTender';
import { stationJumpIn } from './stationJumpIn';
import { strikeRun } from './strikeRun';
import { warpOut } from './warpOut';

export const maneuvers: ManeuverDef[] = [
  sensorContact, emergence, carve, rigUp, landing, engage, strikeRun,
  warpOut, reassign, stationJumpIn, shuttleTender, satelliteCycle, powerLink, seatComplete, regionClear, captainJump,
  progressBeam, sectorSweep,
];
