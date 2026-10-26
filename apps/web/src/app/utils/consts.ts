/**
 * Creation limits. Single source of truth — do not duplicate these literals in hooks/components.
 * See docs/adr/0018 and apps/web/docs/feature/home/place-channel-create.md.
 */

/** Maximum number of places a user can create (per owned cloud). */
export const MAX_PLACES = 5;

/** Maximum number of channels (group rooms) per place. */
export const MAX_CHANNELS_PER_PLACE = 100;

/** Maximum channels for guest users. */
export const GUEST_MAX_CHANNELS = 3;
