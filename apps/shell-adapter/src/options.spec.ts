import type { OptionContext, OptionDefinition, OptionRule, OptionText } from '@lemoncloud/hybrid-shell';

import {
    CHECKOUT_STORE_KEY,
    checkoutChoice,
    FILES_STORE_KEY,
    filesChoice,
    MEDIA_STORE_KEY,
    mediaChoice,
    NOT_DECLARED,
    SANDBOX_STORE_KEY,
    SHELL_CHECKOUT_CHOICES,
    SHELL_FILES_CHOICES,
    SHELL_MEDIA_CHOICES,
} from './checkout';
import { BROKEN_PAIR_REASON, douOptions, SANDBOX_LOCAL_REASON, SANDBOX_PROD_REASON } from './options';

const on = (env: OptionContext['env'], values: Record<string, string | boolean> = {}): OptionContext => ({
    env,
    device: { id: 'iphone', label: 'iPhone', platform: 'ios' },
    values,
});

const rule = <T>(value: OptionRule<T> | undefined, context: OptionContext): T | undefined =>
    typeof value === 'function' ? (value as (context: OptionContext) => T)(context) : value;

const option = (id: string): OptionDefinition => {
    const found = douOptions().find(item => item.id === id);
    if (!found) throw new Error(`no option ${id}`);
    return found;
};

const choice = (id: string, value: string) => {
    const item = option(id);
    if (item.kind !== 'select') throw new Error(`${id} is not a select`);
    const found = item.choices.find(entry => entry.value === value);
    if (!found) throw new Error(`no choice ${value}`);
    return found;
};

describe('douOptions', () => {
    it('declares each choice the adapter reads, under the store key it reads, and relaunches to apply it', () => {
        const options = douOptions();
        expect(options.map(item => item.id)).toEqual([
            CHECKOUT_STORE_KEY,
            SANDBOX_STORE_KEY,
            MEDIA_STORE_KEY,
            FILES_STORE_KEY,
        ]);
        expect(options.every(item => item.applies === 'relaunch')).toBe(true);
    });

    it('lists every value the adapter accepts, and a default among them', () => {
        const values = (id: string) => {
            const item = option(id);
            return item.kind === 'select' ? item.choices.map(entry => entry.value) : [];
        };
        expect(values(CHECKOUT_STORE_KEY)).toEqual([...SHELL_CHECKOUT_CHOICES].sort(byStoreFirst));
        expect(values(MEDIA_STORE_KEY)).toEqual([NOT_DECLARED, ...SHELL_MEDIA_CHOICES]);
        expect(values(FILES_STORE_KEY)).toEqual([NOT_DECLARED, ...SHELL_FILES_CHOICES]);
        for (const item of douOptions()) {
            if (item.kind === 'select') expect(item.choices.map(entry => entry.value)).toContain(item.default);
        }
    });

    it("reads each panel value as the adapter's choice", () => {
        const kept = (key: string, value: unknown) => new Map<string, unknown>([[key, value]]);
        expect(checkoutChoice(kept(CHECKOUT_STORE_KEY, 'web'), 'store')).toBe('web');
        expect(mediaChoice(kept(MEDIA_STORE_KEY, NOT_DECLARED), 'browser')).toBeUndefined();
        expect(filesChoice(kept(FILES_STORE_KEY, NOT_DECLARED), 'shell')).toBeUndefined();
    });

    it('lets the sandbox be switched on against dev only, and says why not elsewhere', () => {
        const sandbox = option(SANDBOX_STORE_KEY);
        expect(rule(sandbox.disabled, on('dev'))).toBe(false);
        expect(rule(sandbox.disabled, on('prod'))).toBe(true);
        expect(rule<OptionText | undefined>(sandbox.reason, on('prod'))).toBe(SANDBOX_PROD_REASON);
        expect(rule(sandbox.disabled, on('localhost'))).toBe(true);
        expect(rule<OptionText | undefined>(sandbox.reason, on('localhost'))).toBe(SANDBOX_LOCAL_REASON);
    });

    it("greys out the app's picker beside the page's transfers, a pair no real host declares", () => {
        const pickerBesidePage = choice(MEDIA_STORE_KEY, 'shell');
        const pageBesidePicker = choice(FILES_STORE_KEY, 'browser');
        expect(rule(pickerBesidePage.disabled, on('dev', { [FILES_STORE_KEY]: 'browser' }))).toBe(true);
        expect(rule(pickerBesidePage.disabled, on('dev', { [FILES_STORE_KEY]: 'shell' }))).toBe(false);
        expect(rule(pageBesidePicker.disabled, on('dev', { [MEDIA_STORE_KEY]: 'shell' }))).toBe(true);
        expect(rule(pageBesidePicker.disabled, on('dev', { [MEDIA_STORE_KEY]: NOT_DECLARED }))).toBe(false);
        expect(pickerBesidePage.reason).toBe(BROKEN_PAIR_REASON);
    });
});

const ORDER = ['store', 'web', 'none', 'apple', 'google', 'legacy'];
const byStoreFirst = (a: string, b: string) => ORDER.indexOf(a) - ORDER.indexOf(b);
