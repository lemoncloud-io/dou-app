/**
 * `i18n/locales.spec.ts`
 *
 * The English files are typed as their Korean twins, which catches a missing key at compile time —
 * but not in the event-name maps (plain records), and not a key left empty. This checks both
 * languages leaf by leaf, so a failure names the key.
 */
import { describe, expect, it } from 'vitest';

import { EVENT_NAMES, NAMESPACES, resources } from './locales';

const leaves = (value: unknown, prefix = ''): Array<[string, unknown]> =>
    value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
        : [[prefix, value]];

const keysOf = (value: unknown) =>
    leaves(value)
        .map(([key]) => key)
        .sort();

describe('locales', () => {
    it.each(NAMESPACES)('has the same keys in Korean and English: %s', ns => {
        const ko = keysOf(resources.ko[ns]);
        const en = keysOf(resources.en[ns]);
        expect(ko.filter(key => !en.includes(key))).toEqual([]);
        expect(en.filter(key => !ko.includes(key))).toEqual([]);
    });

    it('names the same events in both languages', () => {
        const ko = keysOf(EVENT_NAMES.ko);
        const en = keysOf(EVENT_NAMES.en);
        expect(ko.filter(key => !en.includes(key))).toEqual([]);
        expect(en.filter(key => !ko.includes(key))).toEqual([]);
    });

    it('leaves no string empty', () => {
        const empty = (['ko', 'en'] as const).flatMap(lng =>
            leaves({ ...resources[lng], events: EVENT_NAMES[lng] })
                .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
                .map(([key]) => `${lng}:${key}`)
        );
        expect(empty).toEqual([]);
    });

    it('keeps the same interpolation slots in both languages', () => {
        const slots = (text: unknown) =>
            [...String(text).matchAll(/{{(\w+)}}/g)]
                .map(m => m[1])
                .sort()
                .join(',');
        const mismatched = NAMESPACES.flatMap(ns => {
            const en = new Map(leaves(resources.en[ns]));
            return leaves(resources.ko[ns])
                .filter(([key, value]) => slots(value) !== slots(en.get(key)))
                .map(([key]) => `${ns}:${key}`);
        });
        expect(mismatched).toEqual([]);
    });
});
