import { beforeEach, describe, expect, it } from 'vitest';

import { storageKeyFor } from '@chatic/config';

import { migrateLegacyPushMuted } from './legacyNotificationPrefsMigration';

const LEGACY_KEY = 'chatic-notification-prefs';

/** The shape zustand's persist middleware writes. */
const blob = (state: Record<string, unknown>) => JSON.stringify({ state, version: 0 });

describe('migrateLegacyPushMuted', () => {
    beforeEach(() => localStorage.clear());

    it('carries a mute over, so the server-side mute is not contradicted by the switch', () => {
        localStorage.setItem(LEGACY_KEY, blob({ desktopEnabled: true, pushMuted: true }));

        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBe('true');
    });

    it('carries an explicit false too — it is a real answer, not an absence', () => {
        localStorage.setItem(LEGACY_KEY, blob({ pushMuted: false }));

        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBe('false');
    });

    it('strips only the migrated field, leaving the settings that still live in the blob', () => {
        localStorage.setItem(
            LEGACY_KEY,
            blob({ desktopEnabled: false, mutedChannels: { c1: true }, quietHours: null, pushMuted: true })
        );

        migrateLegacyPushMuted();

        expect(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '{}')).toEqual({
            state: { desktopEnabled: false, mutedChannels: { c1: true }, quietHours: null },
            version: 0,
        });
    });

    // The field has to leave the blob, not just be copied out: zustand's persist merges unknown
    // persisted fields back into the store on hydration, so one left behind would be re-persisted
    // on the store's next write and outlive the field it belongs to.
    it('does not resurrect the value on a later boot', () => {
        localStorage.setItem(LEGACY_KEY, blob({ pushMuted: true }));

        migrateLegacyPushMuted();
        localStorage.setItem(storageKeyFor('ui.pushMuted'), 'false');
        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBe('false');
    });

    it('leaves an already-migrated key alone', () => {
        localStorage.setItem(storageKeyFor('ui.pushMuted'), 'false');
        localStorage.setItem(LEGACY_KEY, blob({ pushMuted: true }));

        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBe('false');
    });

    it('does nothing when there is no legacy blob at all', () => {
        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBeNull();
    });

    it('leaves a blob that never held the field untouched', () => {
        localStorage.setItem(LEGACY_KEY, blob({ desktopEnabled: true }));

        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBeNull();
        expect(localStorage.getItem(LEGACY_KEY)).toBe(blob({ desktopEnabled: true }));
    });

    it('survives a corrupt blob rather than throwing into the boot path', () => {
        localStorage.setItem(LEGACY_KEY, 'not json');

        expect(() => migrateLegacyPushMuted()).not.toThrow();
        expect(localStorage.getItem(LEGACY_KEY)).toBe('not json');
    });

    it('ignores a non-boolean value, which carries nothing recoverable', () => {
        localStorage.setItem(LEGACY_KEY, blob({ pushMuted: 'yes' }));

        migrateLegacyPushMuted();

        expect(localStorage.getItem(storageKeyFor('ui.pushMuted'))).toBeNull();
    });
});
