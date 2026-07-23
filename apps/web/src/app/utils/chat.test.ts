import type { DomainChat } from '@chatic/data';

import { isOwnSystemChat } from './chat';

const chat = (fields: Partial<DomainChat>): DomainChat => fields as unknown as DomainChat;

describe('isOwnSystemChat — 내가 주체인 시스템 메시지 판별', () => {
    it('stereo가 system이고 ownerId가 내 uid면 true', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: 'me' }), 'me')).toBe(true);
    });

    it('다른 사람의 시스템 메시지는 false', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: 'other' }), 'me')).toBe(false);
    });

    it('내가 보낸 일반 메시지는 false', () => {
        expect(isOwnSystemChat(chat({ stereo: 'user', ownerId: 'me' }), 'me')).toBe(false);
        expect(isOwnSystemChat(chat({ ownerId: 'me' }), 'me')).toBe(false);
    });

    it('uid가 비어 있으면 ownerId가 비어 있어도 false (미인증 가드)', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: '' }), '')).toBe(false);
        expect(isOwnSystemChat(chat({ stereo: 'system' }), '')).toBe(false);
    });
});
