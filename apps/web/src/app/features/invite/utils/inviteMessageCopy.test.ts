import { composeInviteSmsBody } from './inviteMessageCopy';

describe('composeInviteSmsBody', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
        options ? `${key}:${JSON.stringify(options)}` : key;

    it('보낸이 이름이 있으면 그대로 사용한다', () => {
        expect(composeInviteSmsBody(t, '홍길동', 'https://dou.chatic.io/s?code=abc')).toBe(
            'contactInvite.smsMessage:{"senderName":"홍길동","deeplink":"https://dou.chatic.io/s?code=abc"}'
        );
    });

    it('보낸이 이름이 없으면 기본 이름 키로 대체한다', () => {
        expect(composeInviteSmsBody(t, undefined, 'https://dou.chatic.io/s?code=abc')).toBe(
            'contactInvite.smsMessage:{"senderName":"contactInvite.defaultSenderName","deeplink":"https://dou.chatic.io/s?code=abc"}'
        );
    });

    it('빈 문자열도 없는 것으로 취급한다', () => {
        expect(composeInviteSmsBody(t, '', 'https://dou.chatic.io/s?code=abc')).toBe(
            'contactInvite.smsMessage:{"senderName":"contactInvite.defaultSenderName","deeplink":"https://dou.chatic.io/s?code=abc"}'
        );
    });
});
