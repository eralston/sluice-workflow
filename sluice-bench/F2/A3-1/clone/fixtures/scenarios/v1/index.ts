import type { Scenario } from '../../dsl';
import crmQuarter from './crm-quarter';
import meridianSprint from './meridian-sprint';
import podSprint from './pod-sprint';
import todoWeek from './todo-week';

/**
 * The v1 scenarios (14 §1.3), kept out of `scenarios` so AC-27 and the v0 goldens stay put. An SDLC
 * one (`pod-sprint`) is served under Sprints and Solar. One with another pack (`todo-week`,
 * `crm-quarter`) is fixture-only and served under Solar alone, the one chain that reads packs; fake
 * ADO can't serve it either, since its WIQL names SDLC types (17 A3). `meridian-sprint` is the dense pod
 * (22 A13): 12 homeworlds in one region.
 */
export const v1Scenarios: Scenario[] = [podSprint, todoWeek, crmQuarter, meridianSprint];
