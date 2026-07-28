import { PlaceProfileForm } from './PlaceProfileForm';

import type { PlaceProfileFormProps } from './PlaceProfileForm';

export type { PlaceProfileExitCopy } from './PlaceProfileForm';

/** Dialog-container props — the shared form minus the container switch. */
export type PlaceProfileFormDialogProps = Omit<PlaceProfileFormProps, 'container'>;

/**
 * Slide-up dialog variant of {@link PlaceProfileForm} — the form the home dropdown (edit) and the
 * mandatory first-time prompt (create) open. Kept as a named wrapper so existing callers
 * ({@link PlaceProfileEditDialog} / {@link PlaceProfileCreateDialog}) are unchanged; the settings
 * hub renders the same form with `container="page"`.
 */
export const PlaceProfileFormDialog = (props: PlaceProfileFormDialogProps) => (
    <PlaceProfileForm container="dialog" {...props} />
);
