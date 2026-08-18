import type { PreferenceKey } from '@chatic/app-messages';
import { provider } from '../services';
import { DEFAULT_THEME_MODE, isThemeMode, parseThemeMode } from './themeMode';
import type { ThemeMode } from './themeMode';

const THEME_KEY: PreferenceKey = 'theme';

/** Persist the theme as a plain mode ('light'), replacing any legacy envelope. */
export const writeThemeMode = (mode: ThemeMode): void => {
    provider.preferenceService.setSync(THEME_KEY, mode);
};

/**
 * Synchronously read the persisted theme during module evaluation, so the very
 * first frame paints the right colors.
 *
 * Legacy formats are absorbed, and the stored bytes are migrated to the canonical
 * plain mode when they differ — that migration is what lets `FetchPreference` stop
 * handing zustand envelopes to the web.
 */
export const readThemeMode = (): ThemeMode => {
    const raw: unknown = provider.preferenceService.getSync(THEME_KEY);
    const parsed = parseThemeMode(raw);
    if (!parsed) return DEFAULT_THEME_MODE;

    // A value that is not already a canonical plain mode was written by the legacy
    // zustand-persist middleware, whose default was 'system'. A 'system' from that era
    // is a leaked default rather than a choice, so it collapses to light — that leftover
    // is what used to paint a dark shell behind a light-themed app on an OS-dark device.
    //
    // A plain value can only have been written by writeThemeMode, i.e. it passed bridge
    // validation as an explicit choice, so it is honored verbatim — including 'system'.
    // Gating the collapse on the format rather than on every read is what keeps this side
    // from silently disagreeing with the web, which also honors a stored 'system'.
    const mode = !isThemeMode(raw) && parsed === 'system' ? DEFAULT_THEME_MODE : parsed;

    // Compare the stored bytes, not the parsed mode: a plain read stays a read, while a
    // legacy envelope is rewritten even when its mode did not change.
    if (raw !== mode) writeThemeMode(mode);

    return mode;
};
