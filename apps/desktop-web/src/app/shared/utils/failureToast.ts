import { createElement, Fragment, type ReactNode } from 'react';

import { toast, type ToastActionElement } from '@chatic/ui-kit';

import { serverErrorText } from './errors';

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
