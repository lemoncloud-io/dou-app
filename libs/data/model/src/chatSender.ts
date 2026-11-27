export const isWebhookChat = (chat: { stereo?: string }): boolean => chat.stereo === 'webhook';
