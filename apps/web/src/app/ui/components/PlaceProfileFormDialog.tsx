import { PlaceProfileForm } from './PlaceProfileForm';

import type { PlaceProfileFormProps } from './PlaceProfileForm';

export type { PlaceProfileExitCopy } from './PlaceProfileForm';

export type PlaceProfileFormDialogProps = Omit<PlaceProfileFormProps, 'container'>;

export const PlaceProfileFormDialog = (props: PlaceProfileFormDialogProps) => (
    <PlaceProfileForm container="dialog" {...props} />
);
