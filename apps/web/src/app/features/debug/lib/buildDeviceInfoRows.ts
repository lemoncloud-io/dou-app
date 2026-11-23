import type { DeviceInfo } from '@chatic/bridge-messages';

export interface DeviceInfoRow {
    label: string;
    value: string;
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

export interface DeviceInfoRowLabels {
    deviceId: string;
    installId: string;
    platform: string;
    model: string;
    stage: string;
    application: string;
}

export const buildDeviceInfoRows = (deviceInfo: DeviceInfo | null, labels: DeviceInfoRowLabels): DeviceInfoRow[] => [
    toRow(labels.deviceId, deviceInfo?.uniqueDeviceId),
    toRow(labels.installId, deviceInfo?.firebaseInstallationId),
    toRow(labels.platform, deviceInfo?.platform),
    toRow(labels.model, deviceInfo?.deviceModel),
    toRow(labels.stage, deviceInfo?.stage),
    toRow(labels.application, deviceInfo?.application),
];
