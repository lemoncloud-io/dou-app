import { toast } from 'sonner';

import { onTransientUiTransition } from '../navigation';

export const IN_APP_PUSH_TOAST_ID = 'in-app-push-message';

export const dismissTransientUi = (): void => {
    toast.dismiss(IN_APP_PUSH_TOAST_ID);
};

export const installTransientUiDismissal = (): (() => void) => onTransientUiTransition(dismissTransientUi);
