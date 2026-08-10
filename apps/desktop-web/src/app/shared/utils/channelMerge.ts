import type { DomainChannel } from '@chatic/data';

/** A channel's latest message number, from its embedded last message or own counter. */
export const lastChatNoOf = (channel: DomainChannel): number => channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
