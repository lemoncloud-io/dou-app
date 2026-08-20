import { useTranslation } from 'react-i18next';

/**
 * Unread mark for the switcher rows. Figma 4147:24964 retires the old 6×6 red dot
 * (4140:24762, now hidden in the file) in favour of a 20×20 `Colors/Pink` disc carrying an
 * "N" glyph — same pink as the chat-list count pill, so `bg-point-pink` is the token
 * (--point-pink === #FF2D55) rather than a raw hex.
 *
 * Lives here, shared by DouHomeItem / CloudItem / InviteCloudItem, because the three rows
 * previously each hand-rolled the dot and would otherwise drift apart on the next redesign.
 *
 * The "N" is a decorative glyph, not a count and not a translated word, so it is hidden from
 * assistive tech and the real meaning is carried by `cloudSessionSheet.unreadBadge`
 * ("읽지 않음" / "Unread"). `role="status"` matches the web-ui-kit UnreadBadge precedent.
 *
 * `shrink-0` is load-bearing: in the long-name row (Figma 3486:25664) the NAME is the element
 * that truncates while this badge stays fully visible.
 */
export const CloudUnreadBadge = () => {
    const { t } = useTranslation();

    return (
        <span
            role="status"
            aria-label={t('cloudSessionSheet.unreadBadge')}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-point-pink text-[12px] font-semibold leading-[11px] tracking-[-0.12px] text-white"
        >
            <span aria-hidden="true">N</span>
        </span>
    );
};
