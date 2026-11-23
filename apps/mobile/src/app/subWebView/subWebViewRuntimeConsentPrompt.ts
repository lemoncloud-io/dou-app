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

const CONSENT_FILE_ID = 'subwebview-runtime-consent';

let store: SubWebViewConsentStore | null = null;

const openStore = (): SubWebViewConsentStore => {
    if (store) return store;
    try {
        store = createMMKV({ id: CONSENT_FILE_ID });
    } catch {
        const nothing = new Map<string, string>();
        store = { getString: key => nothing.get(key), set: (key, value) => void nothing.set(key, value) };
    }
    return store;
};

const WRITES: readonly SubWebViewRuntimePermission[] = ['chatSend', 'chatReact'];

const PLACE_BOUND: readonly SubWebViewRuntimePermission[] = ['channel', 'chat', 'user'];

export const consentQuestion = (
    host: string,
    permissions: readonly SubWebViewRuntimePermission[]
): { title: string; message: string } => {
    const reads = permissions.filter(permission => !WRITES.includes(permission));
    const sends = permissions.includes('chatSend');
    const reacts = permissions.includes('chatReact');
    const writes = sends && reacts ? 'SendAndReact' : sends ? 'Send' : reacts ? 'React' : null;
    const what = reads.map(permission => t(`webview.subRuntimePermission.${permission}` as TranslationKey)).join(', ');
    const fill = (key: TranslationKey) => t(key).replace('{0}', host).replace('{1}', what);

    const lead =
        reads.length === 0 && writes
            ? fill(`webview.subRuntimeConsent.${writes[0].toLowerCase()}${writes.slice(1)}Only` as TranslationKey)
            : fill(
                  (writes
                      ? `webview.subRuntimeConsent.readAnd${writes}`
                      : 'webview.subRuntimeConsent.read') as TranslationKey
              );
    const sentences = [lead];
    if (reacts) sentences.push(t('webview.subRuntimeConsent.reactRemovesOwn'));
    if (reads.some(permission => PLACE_BOUND.includes(permission))) {
        sentences.push(t('webview.subRuntimeConsent.thisPlaceOnly'));
    }
    if (reads.includes('user')) sentences.push(t('webview.subRuntimeConsent.memberAccounts'));
    if (reads.includes('cloud')) sentences.push(t('webview.subRuntimeConsent.cloudAccount'));
    sentences.push(
        t(
            !writes
                ? 'webview.subRuntimeConsent.changesNothing'
                : reads.length === 0
                  ? 'webview.subRuntimeConsent.readsAndChangesNothingElse'
                  : 'webview.subRuntimeConsent.changesNothingElse'
        )
    );

    return {
        title: t(
            (writes
                ? `webview.subRuntimeConsent.titleWith${writes}`
                : 'webview.subRuntimeConsent.title') as TranslationKey
        ),
        message: sentences.join(' '),
    };
};

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

export const createAppSubWebViewRuntimeConsent = (): SubWebViewRuntimeConsent =>
    createSubWebViewRuntimeConsent({ store: openStore(), ask });
