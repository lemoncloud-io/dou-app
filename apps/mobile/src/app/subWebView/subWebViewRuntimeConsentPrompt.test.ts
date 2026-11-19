import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { consentQuestion } from './subWebViewRuntimeConsentPrompt';

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn() }));
// A sentence comes back as its key's last part with the placeholders it was filled with, and a
// permission as its own name, so a test reads which sentences were chosen, in which order.
jest.mock('../utils', () => ({
    t: (key: string) => {
        const name = key.split('.').pop();
        return key.startsWith('webview.subRuntimePermission.') ? name : `${name}({0}|{1})`;
    },
}));

const host = 'quiz.apps.chatic.io';

describe('consentQuestion', () => {
    it.each<[string, SubWebViewRuntimePermission[], string, string]>([
        [
            'a page that reads only what is the cloud’s says what an owned cloud carries, and nothing of a place',
            ['cloud', 'place', 'session'],
            'title',
            `read(${host}|cloud, place, session) cloudAccount({0}|{1}) changesNothing({0}|{1})`,
        ],
        [
            'a page that reads a place’s rooms says they come only from the place it is opened in',
            ['channel', 'chat'],
            'title',
            `read(${host}|channel, chat) thisPlaceOnly({0}|{1}) changesNothing({0}|{1})`,
        ],
        [
            'a page that reads members says what their accounts carry is read too',
            ['place', 'user'],
            'title',
            `read(${host}|place, user) thisPlaceOnly({0}|{1}) memberAccounts({0}|{1}) changesNothing({0}|{1})`,
        ],
        [
            'a page that reads members and sends names sending in the title and never among the reads',
            ['channel', 'chatSend', 'user'],
            'titleWithSend',
            `readAndSend(${host}|channel, user) thisPlaceOnly({0}|{1}) memberAccounts({0}|{1}) ` +
                'changesNothingElse({0}|{1})',
        ],
        [
            'a page that reads only the cloud and sends says nothing of a place’s reads',
            ['chatSend', 'cloud'],
            'titleWithSend',
            `readAndSend(${host}|cloud) cloudAccount({0}|{1}) changesNothingElse({0}|{1})`,
        ],
        [
            'a page that only sends says it reads nothing',
            ['chatSend'],
            'titleWithSend',
            `sendOnly(${host}|) readsAndChangesNothingElse({0}|{1})`,
        ],
    ])('%s', (_, permissions, title, message) => {
        expect(consentQuestion(host, permissions)).toEqual({ title: `${title}({0}|{1})`, message });
    });
});
