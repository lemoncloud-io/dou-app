import type { ChatAttachmentFilter } from '@chatic/runtime';

export const PHONE_SENDS: ChatAttachmentFilter = ({ type }) => type !== 'text/html';
