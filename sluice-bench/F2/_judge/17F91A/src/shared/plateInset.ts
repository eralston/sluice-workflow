// A capped holo plate's top: below the player, and below the overlay stack (partial-history line, banners) when it is lower.

/** A capped plate's own margin below the inset (measured on the drive still). */
export const PLATE_TOP_MARGIN = 20;
/** The top inset a capped plate keeps below: the player's, or the overlay stack's measured bottom less the plate's own margin. */
export const plateTopInset = (cameraTop: number, stackBottom: number): number => Math.max(cameraTop, stackBottom - PLATE_TOP_MARGIN);
