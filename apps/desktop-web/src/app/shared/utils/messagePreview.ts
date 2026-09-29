import i18next from 'i18next';

import { chatImageCount, type DomainChat } from '@chatic/data';

import { messagePlainText } from './messagePlainText';

/**
 * A message as one line for surfaces that are not the feed: an OS notification's body, a
 * sidebar row's preview. Its text when it has any; otherwise what it carries. An image
 * message has no text, so it used to reach these as an empty line ("Raine:" in a banner).
 */
export const messagePreview = (chat: Pick<DomainChat, 'content' | 'upload$$' | 'uploadIds'>): string => {
    const text = messagePlainText(chat.content).trim();
    if (text) return text;
    const images = chatImageCount(chat);
    if (images === 0) return '';
    return images === 1 ? i18next.t('chat.attach.preview') : i18next.t('chat.attach.previewCount', { count: images });
};
