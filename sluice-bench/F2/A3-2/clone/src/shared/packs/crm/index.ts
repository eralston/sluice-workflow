// The CRM domain pack (14 §1.2, 12): a sales team's pipeline, read in engine terms. A Deal is an
// objective, an Escalation a threat and a Follow-up (a call, an email, a meeting) a step; an
// Account is the facility its Quotes are delivered into. Fixture-only (17 A3): its bundles name it
// (`domainPack: 'crm'`) and carry its own mapping, which it also ships. Pure.
import type { StateMapping } from '../../contracts/history';
import type { DomainPack, PackThresholds } from '../../engine/types';
import crmMappingJson from '../../../../config/packs/crm.mapping.json';
import { crmAdapter } from './adapter';
import { CRM_WORDS } from './words';

/** config/packs/crm.mapping.json: every type with its role, every state with its rung. */
export const CRM_MAPPING = crmMappingJson as StateMapping;

/**
 * 18 §5 A6, the CRM reading: Swift passage within 10 working days (a deal takes weeks, not days),
 * and Steady hands at no more than 4 deals and escalations In progress at once (a rep works several).
 */
export const CRM_THRESHOLDS: PackThresholds = { swiftDays: 10, wipK: 4, dayHours: 12 };

export const crmPack: DomainPack = {
  id: 'crm',
  title: 'Sales pipeline (CRM, fixture)',
  mapping: CRM_MAPPING,
  words: CRM_WORDS,
  adapter: crmAdapter,
  thresholds: CRM_THRESHOLDS,
};
