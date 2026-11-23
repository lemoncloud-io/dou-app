import { liveShellValue } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

export const isLogCollectionEnabled = (): boolean => runtime.settings.get<boolean>('log.collection.enabled') !== false;

export const isLogUploadHeldByApp = (): boolean => liveShellValue('CHATIC_APP_LOG_UPLOAD_HOLD') === true;

export const isLogUploadHeld = (): boolean =>
    runtime.settings.get<boolean>('log.upload.hold') === true || isLogUploadHeldByApp();

export const setLogUploadHold = (hold: boolean): void => {
    runtime.settings.set('log.upload.hold', hold, { lane: 'local' });
};

export const createLogUploadSwitch =
    (disabledByBuild = false): (() => boolean) =>
    () => {
        if (!isLogCollectionEnabled()) return false;
        if (isLogUploadHeld()) return false;

        const enabled = runtime.settings.snapshot<boolean>('log.upload.enabled');
        if (enabled?.isOverridden) return enabled.value === true;
        return !disabledByBuild;
    };
