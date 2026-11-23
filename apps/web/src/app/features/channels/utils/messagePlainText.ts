import { blocksToPlainText, parseBlocks } from '@chatic/block-kit';
import { isWebhookChat, toPlainPreview, toPlainText } from '@chatic/runtime';

export const messagePlainText = (content?: string): string => {
    const blocks = parseBlocks(content);
    return blocks ? blocksToPlainText(blocks) : (content ?? '');
};

export const chatPlainText = (chat: { content?: string; stereo?: string }): string =>
    isWebhookChat(chat) ? messagePlainText(chat.content) : (chat.content ?? '');

export const messagePreview = (content?: string): string => toPlainPreview(messagePlainText(content));

export const messageSearchText = (content?: string): string => toPlainText(messagePlainText(content));

const DELETE_PREVIEW_LENGTH = 60;

export const deleteConfirmQuote = (content?: string): string => {
    const oneLine = messagePreview(content).replace(/\s+/g, ' ').trim();
    return oneLine.length > DELETE_PREVIEW_LENGTH ? `${oneLine.slice(0, DELETE_PREVIEW_LENGTH)}…` : oneLine;
};
