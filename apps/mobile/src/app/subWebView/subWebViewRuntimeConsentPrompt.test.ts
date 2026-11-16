import { consentQuestion } from './subWebViewRuntimeConsentPrompt';

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn() }));
// Each key comes back as itself, so the test reads which words were chosen and what filled them.
jest.mock('../utils', () => ({ t: (key: string) => `${key}[{0}|{1}]` }));

describe('consentQuestion', () => {
    it('asks to read, and says nothing can change, for a page that only reads', () => {
        expect(consentQuestion('quiz.apps.chatic.io', ['channel', 'chat'])).toEqual({
            title: 'webview.subRuntimeConsent.title[{0}|{1}]',
            message:
                'webview.subRuntimeConsent.message[quiz.apps.chatic.io|' +
                'webview.subRuntimePermission.channel[{0}|{1}], webview.subRuntimePermission.chat[{0}|{1}]]',
        });
    });

    it('names sending in the title, and never among the reads, for a page that also sends', () => {
        const question = consentQuestion('quiz.apps.chatic.io', ['channel', 'chat', 'chatSend']);
        expect(question.title).toBe('webview.subRuntimeConsent.titleWithSend[{0}|{1}]');
        expect(question.message).toBe(
            'webview.subRuntimeConsent.messageWithSend[quiz.apps.chatic.io|' +
                'webview.subRuntimePermission.channel[{0}|{1}], webview.subRuntimePermission.chat[{0}|{1}]]'
        );
        expect(question.message).not.toContain('chatSend');
    });

    it('asks to send alone for a page that reads nothing', () => {
        expect(consentQuestion('quiz.apps.chatic.io', ['chatSend'])).toEqual({
            title: 'webview.subRuntimeConsent.titleWithSend[{0}|{1}]',
            message: 'webview.subRuntimeConsent.messageSendOnly[quiz.apps.chatic.io|{1}]',
        });
    });
});
