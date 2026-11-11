import type { StorageMedium } from '@chatic/bridge-messages';

/** The media this shell keeps; also what `CHATIC_APP_STORAGE_MEDIA` lists. */
export const STORAGE_MEDIA: readonly StorageMedium[] = ['nativeSecure'];

export const isKeptMedium = (medium: unknown): medium is StorageMedium =>
    typeof medium === 'string' && (STORAGE_MEDIA as readonly string[]).includes(medium);

export const isStringRecord = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(entry => typeof entry === 'string');

export const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(entry => typeof entry === 'string');

export const invalid = <T extends 'OnStorageGet' | 'OnStorageSave' | 'OnStorageClear'>(type: T, message: string) => ({
    type,
    success: false,
    error: { code: 'INVALID', message },
});
