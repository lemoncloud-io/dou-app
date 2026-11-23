export const CUSTOM_UI_CHANNEL = 'chatic-custom-ui';

export interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}

export const CUSTOM_UI_APPLY_REFUSED = 'custom UI bundles can only be applied on the dev channel';

export const customUiRefusal = (action: unknown, isDevChannel: boolean): string | null =>
    action === 'apply' && !isDevChannel ? CUSTOM_UI_APPLY_REFUSED : null;

export type CustomUiBoot = { source: 'builtin' } | { source: 'restore' } | { source: 'override'; root: string };

export const customUiBoot = (
    isDevChannel: boolean,
    override: string | undefined,
    overrideServable: boolean
): CustomUiBoot => {
    if (!isDevChannel) return { source: 'builtin' };
    if (override && overrideServable) return { source: 'override', root: override };
    return { source: 'restore' };
};
