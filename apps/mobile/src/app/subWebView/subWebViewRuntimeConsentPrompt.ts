import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
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

/** The permissions whose reads are held to the place the view opened on. */
const PLACE_BOUND: readonly SubWebViewRuntimePermission[] = ['channel', 'chat', 'user'];

/**
 * The words of the question, one sentence per thing the user is agreeing to:
 *
 * 1. what the page reads (and, with `chatSend`, that it posts in the user's name) — sending is named on
 *    its own, in the title too, never listed among the reads;
 * 2. with a place's reads (`channel`, `chat`, `user`), that they come from this place only — a yes is
 *    kept per place, so another place asks again;
 * 3. with `user`, that members come with what their accounts carry, and with `cloud`, that an owned
 *    cloud comes with its owner, account, subscription and server — the rows are not filtered;
 * 4. what it cannot do: change anything, or, with `chatSend`, anything else.
 */
export const consentQuestion = (
    host: string,
    permissions: readonly SubWebViewRuntimePermission[]
): { title: string; message: string } => {
    const reads = permissions.filter(permission => permission !== 'chatSend');
    const sends = permissions.includes('chatSend');
    const what = reads.map(permission => t(`webview.subRuntimePermission.${permission}` as TranslationKey)).join(', ');
    const fill = (key: TranslationKey) => t(key).replace('{0}', host).replace('{1}', what);

    const lead =
        reads.length === 0
            ? fill('webview.subRuntimeConsent.sendOnly')
            : fill(sends ? 'webview.subRuntimeConsent.readAndSend' : 'webview.subRuntimeConsent.read');
    const sentences = [lead];
    if (reads.some(permission => PLACE_BOUND.includes(permission))) {
        sentences.push(t('webview.subRuntimeConsent.thisPlaceOnly'));
    }
    if (reads.includes('user')) sentences.push(t('webview.subRuntimeConsent.memberAccounts'));
    if (reads.includes('cloud')) sentences.push(t('webview.subRuntimeConsent.cloudAccount'));
    sentences.push(
        t(
            !sends
                ? 'webview.subRuntimeConsent.changesNothing'
                : reads.length === 0
                  ? 'webview.subRuntimeConsent.readsAndChangesNothingElse'
                  : 'webview.subRuntimeConsent.changesNothingElse'
        )
    );

    return {
        title: t(sends ? 'webview.subRuntimeConsent.titleWithSend' : 'webview.subRuntimeConsent.title'),
        message: sentences.join(' '),
    };
};

/** The question, as a system alert; dismissing it is a refusal. */
const ask: AskSubWebViewConsent = ({ host, permissions }) =>
    new Promise(resolve => {
        const { title, message } = consentQuestion(host, permissions);
        Alert.alert(
            title,
            message,
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
