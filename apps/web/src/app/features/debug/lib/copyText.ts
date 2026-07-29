import { isNative } from '@chatic/bridges';

// Direct path, not the `bridge` barrel: the barrel re-exports ./navigation, which pulls
// usePushNavigate → @chatic/web-core → webTransport's `import.meta.env`. ts-jest emits CommonJS,
// where that is a syntax error, so anything importing this module became untestable.
import { appBridge } from '../../../bridge/appBridge';

/** Copy a value using the native bridge inside the app shell, else the Clipboard API. */
export const copyText = (value: string | null | undefined) => {
    if (!value) return;
    if (isNative()) {
        void appBridge.copyClipBoard(value);
        return;
    }
    void navigator.clipboard?.writeText(value);
};
