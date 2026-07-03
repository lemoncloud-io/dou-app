import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { countUnreadMembers, formatSystemChatLabel, isSystemChat } from './systemChat';

const chat = (fields: Partial<DomainChat>): DomainChat => fields as unknown as DomainChat;

describe('isSystemChat', () => {
    it('stereo가 system이면 시스템 메시지로 판정한다', () => {
        expect(isSystemChat(chat({ stereo: 'system' }))).toBe(true);
    });

    it('user/빈 stereo는 시스템 메시지가 아니다', () => {
        expect(isSystemChat(chat({ stereo: 'user' }))).toBe(false);
        expect(isSystemChat(chat({ stereo: '' }))).toBe(false);
    });
});

describe('countUnreadMembers', () => {
    const members = ['me', 'u1', 'u2'];

    it('사용자 메시지는 커서가 chatNo 미만인 멤버 수를 세고 보낸이는 제외한다', () => {
        // me read up to 5, u1 read up to 2, u2 has no cursor (0). Owner is "me".
        const cursors = new Map([
            ['me', 5],
            ['u1', 2],
        ]);
        // chatNo=3 → u1(2<3) and u2(0<3) are unread; "me" excluded as owner.
        expect(countUnreadMembers(chat({ stereo: 'user', ownerId: 'me', chatNo: 3 }), members, cursors)).toBe(2);
    });

    it('시스템 메시지는 커서와 무관하게 안읽음 0을 반환한다', () => {
        const cursors = new Map<string, number>(); // nobody has read anything
        expect(countUnreadMembers(chat({ stereo: 'system', ownerId: 'u1', chatNo: 9 }), members, cursors)).toBe(0);
    });
});

describe('formatSystemChatLabel', () => {
    it('join/leave subType별 문구를 만든다', () => {
        expect(formatSystemChatLabel('join', '앨리스')).toBe('앨리스님이 입장했습니다');
        expect(formatSystemChatLabel('leave', '앨리스')).toBe('앨리스님이 퇴장했습니다');
    });

    it('알 수 없는 subType이나 빈 이름도 안전하게 표기한다', () => {
        expect(formatSystemChatLabel('' as const, '밥')).toBe('밥 시스템 메시지');
        expect(formatSystemChatLabel('join', '')).toBe('알 수 없음님이 입장했습니다');
    });
});
