import { formatLogForCopy } from './formatLogForCopy';

describe('formatLogForCopy', () => {
    it('타임스탬프와 메시지를 "[시각] 메시지" 한 줄로 합친다', () => {
        expect(formatLogForCopy({ timestamp: '14:03:07', message: 'FCM Token Received' })).toBe(
            '[14:03:07] FCM Token Received'
        );
    });

    it('JSON 페이로드처럼 공백/괄호가 섞인 메시지도 그대로 보존한다', () => {
        const message = '[OpenedApp] Data: {"cid":"cloud_1","sid":"100002"}';
        expect(formatLogForCopy({ timestamp: '09:15:42', message })).toBe(`[09:15:42] ${message}`);
    });

    it('빈 메시지여도 타임스탬프 접두어는 유지한다', () => {
        expect(formatLogForCopy({ timestamp: '00:00:00', message: '' })).toBe('[00:00:00] ');
    });
});
