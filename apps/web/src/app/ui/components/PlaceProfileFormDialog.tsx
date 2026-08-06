import { PlaceProfileForm } from './PlaceProfileForm';

import type { PlaceProfileFormProps } from './PlaceProfileForm';

export type { PlaceProfileExitCopy } from './PlaceProfileForm';

/** Dialog-container props — the shared form minus the container switch. */
export type PlaceProfileFormDialogProps = Omit<PlaceProfileFormProps, 'container'>;

/**
 * Slide-up dialog variant of {@link PlaceProfileForm} — opened by {@link PlaceProfileEditDialog}
 * from the channel settings screen. Kept as a named wrapper so that caller stays unchanged; the
 * settings hub renders the same form with `container="page"`.
 */
export const PlaceProfileFormDialog = (props: PlaceProfileFormDialogProps) => (
    <PlaceProfileForm container="dialog" {...props} />
);
