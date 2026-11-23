import { deviceStore } from '../../../storage';

const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

export const hasMiniAppConsent = (accountId: string | null, host: string): boolean => {
    if (!accountId) return false;
    return deviceStore.get(consentKey(accountId, host)) === '1';
};

export const writeMiniAppConsent = (accountId: string | null, host: string): void => {
    if (!accountId) return;
    deviceStore.set(consentKey(accountId, host), '1');
};
