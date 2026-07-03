import { systemMessageSuffixKey } from './systemMessage';

describe('systemMessageSuffixKey', () => {
    it('join/leave subType를 해당 i18n 키로 매핑한다', () => {
        expect(systemMessageSuffixKey('join')).toBe('chat.room.system.join');
        expect(systemMessageSuffixKey('leave')).toBe('chat.room.system.leave');
    });

    it('빈 값/미상 subType은 null을 반환해 content fallback을 허용한다', () => {
        expect(systemMessageSuffixKey('')).toBeNull();
        expect(systemMessageSuffixKey(undefined)).toBeNull();
    });
});
