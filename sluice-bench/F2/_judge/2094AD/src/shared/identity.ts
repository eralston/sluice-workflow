// One identity line for every object (22 B3): its ADO type, its ID and its status, in that order,
// whatever surface shows it (the details panel, a list row, a plate). Parts that don't apply are left
// out. The chart's name for the thing is added after it by the renderer, quieter (R12), never here.

/** `User Story · #1234 · Active`; `Area Path · 12 User Stories · 4 Bugs`; `Repository`. */
export function identityLine(type: string | undefined, id?: number | string | null, status?: string | null): string {
  return [type, id === undefined || id === null || id === '' ? undefined : `#${id}`, status].filter(Boolean).join(' · ');
}
