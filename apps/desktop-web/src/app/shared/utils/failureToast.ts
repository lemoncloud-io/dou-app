import { createElement, Fragment, type ReactNode } from 'react';

import type { ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { serverErrorText } from './errors';

/**
 * A failure toast: the sentence the person can act on as the title, any explanation of the app's
 * own under it, and then the server's own words. The raw text used to reach only the console,
 * which left a refusal such as `400 INVALID - grace-timeout by invite[910024]` unreadable to
 * anyone reporting it.
 */
export const toastFailure = (
    title: string,
    error: unknown,
    { detail, action }: { detail?: ReactNode; action?: ToastActionElement } = {}
): void => {
    const raw = serverErrorText(error);
    const rawLine = raw
        ? createElement('span', { className: 'mt-1 block break-all font-mono text-caption' }, raw)
        : null;
    const description = detail && rawLine ? createElement(Fragment, null, detail, rawLine) : (detail ?? rawLine);
    toast({ variant: 'destructive', title, description: description ?? undefined, action });
};
