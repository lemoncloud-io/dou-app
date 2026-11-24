import type { OptionContext, OptionDefinition } from '@lemoncloud/hybrid-shell';

import {
    CHECKOUT_STORE_KEY,
    checkoutChoice,
    FILES_STORE_KEY,
    filesChoice,
    MEDIA_STORE_KEY,
    mediaChoice,
    NOT_DECLARED,
    SANDBOX_STORE_KEY,
} from './checkout';

const CHECKOUT_GROUP = 'Checkout';
const HOST_GROUP = 'Attachments and files';

export const SANDBOX_PROD_REASON = 'Never against prod';
export const SANDBOX_LOCAL_REASON = 'The local backend has no payment server';
const SANDBOX_HINT =
    'With a store checkout it imitates the virtual store, up to the purchase; the real in-app sandbox is a device and store setting. With a web checkout it carries on to the payment server.';
export const BROKEN_PAIR_REASON = "No real host pairs the app's picker with the page's transfers";

const sandboxReason = ({ env }: OptionContext): string | undefined =>
    env === 'prod' ? SANDBOX_PROD_REASON : env === 'localhost' ? SANDBOX_LOCAL_REASON : undefined;

export const douOptions = (): OptionDefinition[] => [
    {
        id: CHECKOUT_STORE_KEY,
        kind: 'select',
        label: 'Checkout',
        group: CHECKOUT_GROUP,
        hint: 'The virtual store answers on dev only.',
        applies: 'relaunch',
        default: checkoutChoice(),
        choices: [
            { value: 'store', label: "The device's store" },
            { value: 'web', label: 'Web checkout in the app' },
            { value: 'none', label: 'None' },
            { value: 'apple', label: 'Apple App Store' },
            { value: 'google', label: 'Google Play' },
            { value: 'legacy', label: 'Not declared (an app before declarations)' },
        ],
    },
    {
        id: SANDBOX_STORE_KEY,
        kind: 'switch',
        label: 'Sandbox',
        group: CHECKOUT_GROUP,
        hint: SANDBOX_HINT,
        applies: 'relaunch',
        default: false,
        disabled: context => context.env !== 'dev',
        reason: sandboxReason,
    },
    {
        id: MEDIA_STORE_KEY,
        kind: 'select',
        label: 'Who picks attachments',
        group: HOST_GROUP,
        applies: 'relaunch',
        default: mediaChoice() ?? NOT_DECLARED,
        choices: [
            { value: NOT_DECLARED, label: 'Not declared' },
            {
                value: 'shell',
                label: "The app's picker",
                disabled: ({ values }) => values[FILES_STORE_KEY] === 'browser',
                reason: BROKEN_PAIR_REASON,
            },
            { value: 'browser', label: "The page's file input" },
        ],
    },
    {
        id: FILES_STORE_KEY,
        kind: 'select',
        label: 'Who moves files',
        group: HOST_GROUP,
        applies: 'relaunch',
        default: filesChoice() ?? NOT_DECLARED,
        choices: [
            { value: NOT_DECLARED, label: 'Not declared' },
            { value: 'shell', label: "The app's transfers" },
            {
                value: 'browser',
                label: 'The page (upload, download)',
                disabled: ({ values }) => values[MEDIA_STORE_KEY] === 'shell',
                reason: BROKEN_PAIR_REASON,
            },
        ],
    },
];
