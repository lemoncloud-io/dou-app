import type { ChannelView } from '@lemoncloud/chatic-socials-api';

/**
 * 채널의 안읽은 메시지 수를 유도 계산 (derived)
 *
 * vendor 공식: `max(0, channel.chatNo - max(join.chatNo, join.joinedNo))`
 * - 앱 내부에서는 `channel.chatNo` 대신 `channel.lastChat$?.chatNo` 를 최신 chat 번호로 사용
 * - `$join` 가 없으면 (미참여 혹은 join 캐시 미싱) unread 0 으로 간주
 *
 * @param channel `$join` 이 attach 된 ChannelView (없으면 0 반환)
 */
export const computeChannelUnread = (channel: ChannelView | null | undefined): number => {
    if (!channel) return 0;
    const lastNo = channel.lastChat$?.chatNo ?? 0;
    if (!channel.$join) return 0;
    const readNo = Math.max(channel.$join.chatNo ?? 0, channel.$join.joinedNo ?? 0);
    return Math.max(0, lastNo - readNo);
};
