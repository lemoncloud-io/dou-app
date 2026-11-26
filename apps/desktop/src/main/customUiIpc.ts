import { type BrowserWindow, ipcMain } from 'electron';
import { IS_DEV_CHANNEL } from './appChannel';
import {
    applyCustomUi,
    disableCustomUi,
    getActiveCustomUiRoot,
    restoreCustomUi,
    serveCustomUi,
} from './customUiBundle';
import { CUSTOM_UI_CHANNEL, customUiBoot, customUiRefusal, type CustomUiStatus } from './customUiContract';
import { hasEntryPoint } from './customUiState';
import { fromTrustedFrame } from './ipcSenderGate';
import { reloadForCustomUiChange } from './menus';
import { isCustomUiActive, isCustomUiUrl } from './webUrl';

const customUiStatus = (error?: string): CustomUiStatus => ({
    active: isCustomUiActive(),
    root: getActiveCustomUiRoot(),
    ...(error === undefined ? {} : { error }),
});

const asCustomUiRequest = (value: unknown): { action?: unknown; zipUrl?: unknown } =>
    typeof value === 'object' && value !== null ? value : {};

const handleCustomUiApply = async (senderUrl: string | undefined, zipUrl: unknown): Promise<CustomUiStatus> => {
    if (isCustomUiUrl(senderUrl)) return customUiStatus('a bundle cannot apply another bundle');
    if (typeof zipUrl !== 'string' || !zipUrl) return customUiStatus('no zip URL given');
    try {
        await applyCustomUi(zipUrl);
    } catch (error) {
        return customUiStatus(String(error));
    }
    return customUiStatus();
};

const scheduleReload = (win: BrowserWindow): void => {
    setTimeout(() => reloadForCustomUiChange(win), 0);
};

export const registerCustomUiIpc = (win: BrowserWindow): void => {
    ipcMain.removeHandler(CUSTOM_UI_CHANNEL);
    ipcMain.handle(
        CUSTOM_UI_CHANNEL,
        fromTrustedFrame(
            async () => customUiStatus('untrusted frame'),
            async (senderUrl, raw: unknown) => {
                const { action, zipUrl } = asCustomUiRequest(raw);

                const refusal = customUiRefusal(action, IS_DEV_CHANNEL);
                if (refusal !== null) return customUiStatus(refusal);

                if (action === 'status') return customUiStatus();

                if (action === 'disable') {
                    disableCustomUi();
                    scheduleReload(win);
                    return customUiStatus();
                }

                if (action === 'apply') {
                    const status = await handleCustomUiApply(senderUrl, zipUrl);
                    if (!status.error) scheduleReload(win);
                    return status;
                }

                return customUiStatus(`unknown action: ${String(action)}`);
            }
        )
    );
};

export const bootCustomUi = (): void => {
    const customUiOverride = import.meta.env.MAIN_VITE_CUSTOM_UI_ROOT;
    const overrideServable = !!customUiOverride && hasEntryPoint(customUiOverride);
    const customUiBootSource = customUiBoot(IS_DEV_CHANNEL, customUiOverride, overrideServable);
    if (customUiOverride && !IS_DEV_CHANNEL) {
        console.warn('[shell] MAIN_VITE_CUSTOM_UI_ROOT is ignored off the dev channel', customUiOverride);
    } else if (customUiOverride && !overrideServable) {
        console.warn('[shell] MAIN_VITE_CUSTOM_UI_ROOT has no index.html', customUiOverride);
    }
    if (customUiBootSource.source === 'override') serveCustomUi(customUiBootSource.root);
    else if (customUiBootSource.source === 'restore') restoreCustomUi();
    if (isCustomUiActive()) console.info('[shell] custom UI active', getActiveCustomUiRoot());
};
