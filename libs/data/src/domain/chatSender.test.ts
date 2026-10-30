import { isWebhookChat } from './chatSender';

describe('isWebhookChat', () => {
    it('is true only for a message that came in through the webhook endpoint', () => {
        expect(isWebhookChat({ stereo: 'webhook' })).toBe(true);
        expect(isWebhookChat({ stereo: 'user' })).toBe(false);
        expect(isWebhookChat({ stereo: 'system' })).toBe(false);
        expect(isWebhookChat({})).toBe(false);
    });
});
