import busyWeek from './busy-week';
import edgeHistory from './edge-history';
import orbitWeek from './orbit-week';
import quietWeek from './quiet-week';
import sprintMechanics from './sprint-mechanics';
import sprintPods from './sprint-pods';
import type { Scenario } from '../dsl';

/** The first scenario is the one the app serves in fixture mode; the rest back golden tests. */
export const scenarios: Scenario[] = [orbitWeek, edgeHistory, quietWeek, busyWeek, sprintMechanics, sprintPods];
