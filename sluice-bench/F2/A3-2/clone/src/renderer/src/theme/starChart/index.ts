// The Star Chart theme (14 §8): the remix table. Which asset draws each role, the commands and
// maneuvers it adds, the guides it draws, and its chart-register words. Edit here to remix; each
// part's own file holds its details. Registers itself on import.
import { solarGuide } from '../../chart/scenes/solarGuides';
import { registerTheme } from '../registry';
import type { ThemePack } from '../types';
import { ambient } from './ambient';
import { entrance, entranceCommands } from './entrance';
import { finale, finaleCommands } from './finales';
import { assets } from './assets';
import { homeworldOf } from './homeworlds';
import { commands } from './commands';
import { maneuvers } from './maneuvers';
import { words } from './words';
import { chartAction } from './actions';
import { readCopy } from './readCopy';

/**
 * Roles drawn inside their parent's asset (augmentations and target locks, tender shuttles,
 * point defense), or not at all (containers). Their ids name the part, and no asset registers them,
 * so a stray node of one of these roles falls through to the v0 switch rather than drawing a body.
 */
export const INNER_PARTS: readonly string[] = ['augmentation', 'shuttle', 'point-defense', 'none'];

export const starChart: ThemePack = {
  id: 'star-chart',
  title: 'Star Chart',
  // Role → asset id (./assets): remix by pointing a role at another registered asset.
  roleAsset: {
    seat: 'world',
    objective: 'asteroid',
    threat: 'hive',
    facility: 'dreadnought',
    agent: 'captain',
    // Drawn inside their parent's asset (augmentations, satellites); never a node of their own.
    step: 'augmentation',
    attachment: 'shuttle',
    guard: 'point-defense',
    // Not drawn on the v1 board (12 §3), nor listed: since 19 L6 a station's rows are its PRs.
    container: 'none',
  },
  assets,
  commands: [...commands, ...entranceCommands, ...finaleCommands],
  maneuvers,
  ambient,
  entrance,
  finale,
  guides: [solarGuide],
  words,
  readCopy,
  action: chartAction,
  // Each seat's planet is a named homeworld (2026-10-12): "Wren's Haven".
  seatTitle: homeworldOf,
};

registerTheme(starChart);
