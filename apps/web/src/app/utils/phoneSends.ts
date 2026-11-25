import type { ChatAttachmentFilter } from '@chatic/runtime-react';

export const PHONE_SENDS: ChatAttachmentFilter = ({ type }) => type !== 'text/html';
