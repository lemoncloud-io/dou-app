import type { DomainChannel } from '@chatic/data';

/** Minimal shape needed to resolve a channel's display name. */
type ChannelNameSource = Pick<DomainChannel, 'name'> & { $join?: { nick?: string | null } | null };

/**
 * Resolve the room name to show the current user. An invited member can set a
 * personal room name via `join.update` (nick), shown only to them; that nick —
 * carried inline on the channel's own `$join` — takes precedence over the
 * owner-set `channel.name`. Returns an empty string when neither is set, so
 * callers apply their own i18n fallback (e.g. "이름 없는 채널").
 */
export const resolveChannelName = (channel: ChannelNameSource | null | undefined): string =>
    channel?.$join?.nick?.trim() || channel?.name?.trim() || '';
