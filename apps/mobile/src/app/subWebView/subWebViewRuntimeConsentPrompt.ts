import { Alert } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { t, type TranslationKey } from '../utils';
import {
    createSubWebViewRuntimeConsent,
    type AskSubWebViewConsent,
    type SubWebViewConsentStore,
    type SubWebViewRuntimeConsent,
} from './subWebViewRuntimeConsent';

/** The file the allowed answers are kept in: the app's own, apart from every page's storage. */
const CONSENT_FILE_ID = 'subwebview-runtime-consent';

let store: SubWebViewConsentStore | null = null;

// Opened once and kept: every MMKV instance registers a memory-warning listener that is never removed.
const openStore = (): SubWebViewConsentStore => {
    if (store) return store;
    try {
        store = createMMKV({ id: CONSENT_FILE_ID });
    } catch {
        // No file: answers are kept in memory for this run of the app only — never answered for the user.
        const nothing = new Map<string, string>();
        store = { getString: key => nothing.get(key), set: (key, value) => void nothing.set(key, value) };
    }
    return store;
};

/** The question, as a system alert; dismissing it is a refusal. */
const ask: AskSubWebViewConsent = ({ host, permissions }) =>
    new Promise(resolve => {
        const what = permissions
            .map(permission => t(`webview.subRuntimePermission.${permission}` as TranslationKey))
            .join(', ');
        Alert.alert(
            t('webview.subRuntimeConsent.title'),
            t('webview.subRuntimeConsent.message').replace('{0}', host).replace('{1}', what),
            [
                { text: t('webview.subRuntimeConsent.deny'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('webview.subRuntimeConsent.allow'), onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
        );
    });

/** A view's consent, over the app's kept answers and its alert. */
export const createAppSubWebViewRuntimeConsent = (): SubWebViewRuntimeConsent =>
    createSubWebViewRuntimeConsent({ store: openStore(), ask });
