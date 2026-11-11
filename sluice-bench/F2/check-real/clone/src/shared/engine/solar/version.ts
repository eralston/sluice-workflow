// 14 §4 — the solar layout's version and the geometry it versions. Bump SOLAR_LAYOUT_VERSION with
// any change below (or to the rules in this folder), and regenerate the solar goldens in the same
// change. Sizes are world units, after 08 §2 (see GEOMETRY below). Pure.

export const SOLAR_LAYOUT_VERSION = 10; // 10: compound promotion (a waiting PR takes the first slot that frees, 23 C6) and a ghost reseated while Off takes a slot (23 C9, 2026-10-28); 9: trophies a full trophy off the rim (2026-10-24); 8: the mandala (22 Block D, 2026-10-16); 7: stations on two rings (22 C11, 2026-10-15); 6: stations half a planet's size (2026-10-12)

/**
 * How big every space object is against its label (v2, 2026-10-12): labels keep their pixel size, so
 * the objects were small in the free space around them. Sizes below are the v1 values times this, and
 * gaps, lanes and search steps stay as they were, so the growth comes out of the empty space.
 */
export const OBJECT_SCALE = 2;

/**
 * The camera looks down onto the orbital plane: an orbit through rx has ry = rx · SQUASH. v0's boards
 * use 0.5; the solar layout (v2, 2026-10-12) tilts less, so its orbits are rounder and fill a stage that
 * is wider than tall, and every orbit's radial band shrinks to match.
 */
export const SQUASH = 0.7;

export const GEOMETRY = Object.freeze({
  /**
   * A distant star: small beside the planets, which loom (v4, 2026-10-12). It sits at the origin, and each
   * planet is lit on its star-facing side only, a crescent; its pieces stand on the dark side, overlaying it.
   */
  starR: 150,
  /** A seat's planet. One size for every seat: size never encodes output (INV-19). */
  planetR: 520,
  /** An objective or a threat: a standalone piece in its seat's shadow region. */
  pieceR: 52 * OBJECT_SCALE,
  /** A finished piece: a compact platform in low orbit on the planet's lit edge. */
  platformR: 52 * OBJECT_SCALE * 0.8,
  /** A captain's ship, half its length (the loiter ring's unit, 22 D3; the projection's SHIP_R). */
  shipR: 56,
  /** Clear space between two seats' footprints. */
  seatGap: 420,
  /** The same, from the star: wider, because at small windows a piece's minimum on-screen size outgrows a narrow gap. */
  starGap: 300,
  /** The radius search's step along a seat's ray, and its limit (a seat that fits nowhere sits at the limit). */
  radiusStep: 16,
  maxRadius: 60000,
  /** An orbit arc runs this far past a seat's footprint on each side (world units). */
  arcPad: 80,
  /** The shortest orbit arc (radians, either side of the planet). */
  arcMin: 0.2,
  /** The clear lane between the outermost footprint and the frontier belt, in orbit radius (ρ). */
  lane: 96,
  /** A piece in the frontier belt. */
  frontierR: 44 * OBJECT_SCALE,
  /** Clearance between neighbouring frontier pieces. */
  frontierGap: 24,
  /** Belt padding beyond a piece's own ρ-extent, each side. */
  frontierPad: 32,
  /**
   * A facility's hull, its satellites' distance and size; `facilityReach` covers all of it. A facility
   * is half a planet's size (its hull as long as the planet's radius, art session 2026-10-12), and at
   * least twice a captain ship's on screen (sizing.ts).
   */
  facilityR: 130 * OBJECT_SCALE,
  satelliteDist: 169 * OBJECT_SCALE,
  satelliteR: 21 * OBJECT_SCALE,
  guardDist: 153 * OBJECT_SCALE,
  /** Clearance a facility keeps from everything else. */
  facilityGap: 360,
  /** An orbit line's half-width, as drawn: a facility never sits on one. */
  orbitBand: 24,
  /** The candidate spiral's step (midpoints) and the beside search's step. */
  searchStep: 40,
  /** Rotation step of the beside search (radians): 15°. */
  besideTurn: Math.PI / 12,
  /** The open attachments a compound draws before "+N" (13 §5). */
  compoundCap: 6,
  /** Angle between attachment slots on the front arc (radians): the cap's slots and the "+N" mark share a half turn. */
  attachmentSpread: Math.PI / 7,
  /** Angle between guard slots on the back arc (radians): 40°. */
  guardSpread: (2 * Math.PI) / 9,
});

/** Everything a facility draws reaches this far from its centre. */
export const FACILITY_REACH = GEOMETRY.satelliteDist + GEOMETRY.satelliteR;
