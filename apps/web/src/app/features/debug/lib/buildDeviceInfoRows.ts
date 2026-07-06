import type { DeviceInfo } from '@chatic/app-messages';

/** A single label/value pair rendered in the debug "Device Info" block. */
export interface DeviceInfoRow {
    label: string;
    /** Display value; falls back to a placeholder when the field is empty. */
    value: string;
    /** Raw value used for clipboard copy; null when there is nothing to copy. */
    copyValue: string | null;
}

const EMPTY_PLACEHOLDER = '-';

const toRow = (label: string, value: string | null | undefined): DeviceInfoRow => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return {
        label,
        value: trimmed || EMPTY_PLACEHOLDER,
        copyValue: trimmed || null,
    };
};

/**
 * Builds the rows shown in the debug Device Info block.
 *
 * `deviceId` / `installId` / `platform` come from globals the native shell
 * injects into the WebView; in a plain browser they are absent, so every field
 * degrades to a placeholder instead of throwing.
 *
 * Note: `deviceToken` is intentionally omitted — the native shell never injects
 * it as a global, so it can only be resolved via the push-registration bridge
 * (see the Push debug page).
 */
export const buildDeviceInfoRows = (deviceInfo: DeviceInfo | null): DeviceInfoRow[] => [
    toRow('Device ID', deviceInfo?.deviceId),
    toRow('Install ID', deviceInfo?.installId),
    toRow('Platform', deviceInfo?.platform),
    toRow('Model', deviceInfo?.deviceModel),
    toRow('Stage', deviceInfo?.stage),
    toRow('Application', deviceInfo?.application),
];
