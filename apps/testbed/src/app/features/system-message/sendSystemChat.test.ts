import { describe, expect, it, vi } from 'vitest';

import { sendSystemChat } from './sendSystemChat';

describe('sendSystemChat', () => {
    it('소켓 chat.send 페이로드로 빈 content + stereo:system + subType를 보낸다', async () => {
        const sendChat = vi.fn().mockResolvedValue({ id: 'c1' });

        await sendSystemChat(sendChat, 'CH1', 'join');

        expect(sendChat).toHaveBeenCalledWith({ channelId: 'CH1', content: '', stereo: 'system', subType: 'join' });
    });

    it('leave subType도 그대로 전달한다', async () => {
        const sendChat = vi.fn().mockResolvedValue({ id: 'c1' });

        await sendSystemChat(sendChat, 'CH1', 'leave');

        expect(sendChat).toHaveBeenCalledWith(expect.objectContaining({ stereo: 'system', subType: 'leave' }));
    });

    it('channelId가 없으면 sendChat 호출 없이 에러를 던진다', () => {
        const sendChat = vi.fn();

        expect(() => sendSystemChat(sendChat, '', 'join')).toThrow('channelId is required');
        expect(sendChat).not.toHaveBeenCalled();
    });
});
