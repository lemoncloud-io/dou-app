import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';

/** Copy a value using the native bridge inside the app shell, else the Clipboard API. */
export const copyText = (value: string | null | undefined) => {
    if (!value) return;
    if (isNative()) {
        void appBridge.copyClipBoard(value);
        return;
    }
    void navigator.clipboard?.writeText(value);
};
