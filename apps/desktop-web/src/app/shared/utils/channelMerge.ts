import type { DomainChannel } from '@chatic/runtime-react';

export const lastChatNoOf = (channel: DomainChannel): number => channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
