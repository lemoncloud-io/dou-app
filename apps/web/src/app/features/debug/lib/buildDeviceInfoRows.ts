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

/** Row labels, supplied by the caller so this stays a pure function — see `DeviceInfoScreen`'s i18n table. */
export interface DeviceInfoRowLabels {
    deviceId: string;
    installId: string;
    platform: string;
    model: string;
    stage: string;
    application: string;
}

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
export const buildDeviceInfoRows = (deviceInfo: DeviceInfo | null, labels: DeviceInfoRowLabels): DeviceInfoRow[] => [
    toRow(labels.deviceId, deviceInfo?.uniqueDeviceId),
    toRow(labels.installId, deviceInfo?.firebaseInstallationId),
    toRow(labels.platform, deviceInfo?.platform),
    toRow(labels.model, deviceInfo?.deviceModel),
    toRow(labels.stage, deviceInfo?.stage),
    toRow(labels.application, deviceInfo?.application),
];
