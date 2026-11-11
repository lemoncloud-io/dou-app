import type { ChatAttachmentFilter } from '@chatic/data';

/**
 * The formats this app sends: every one the server takes but an HTML page. Desktop sends HTML and draws
 * it in its document viewer with scripts off; the phone has no such viewer, and its shells' document
 * pickers were never checked against the type, so it neither offers HTML nor sends a page picked anyway
 * (iOS lets any Files item through under the generic type). A received HTML page is a save card here.
 */
export const PHONE_SENDS: ChatAttachmentFilter = ({ type }) => type !== 'text/html';
