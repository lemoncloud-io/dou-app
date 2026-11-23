import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar, NotificationRow, NotificationTypeChip } from '@chatic/web-ui-kit';

import type { NotificationItem } from '../../../utils/notifications';
import { notificationRowParts, splitMentions } from '../utils/rowParts';

export interface NotificationListItemProps {
    item: NotificationItem;
    now: number;
    avatarUrl?: string;
    selectable?: boolean;
    selected?: boolean;
    onPress: (item: NotificationItem) => void;
    onLongPress?: (item: NotificationItem) => void;
}

export const NotificationListItem = ({
    item,
    now,
    avatarUrl,
    selectable,
    selected,
    onPress,
    onLongPress,
}: NotificationListItemProps) => {
    const { t, i18n } = useTranslation();
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    const parts = notificationRowParts(item, t, now, locale);
    const body = splitMentions(parts.body).map((part, index) =>
        part.mention ? (
            <b key={index} className="font-semibold text-foreground">
                {part.text}
            </b>
        ) : (
            <span key={index}>{part.text}</span>
        )
    );
    return (
        <NotificationRow
            avatar={avatarUrl ? <ImageAvatar src={avatarUrl} alt="" size={42} /> : <DefaultAvatar size={42} />}
            sender={item.ownerName || t('notifications.inbox.unknownSender')}
            time={parts.time}
            unread={!item.read}
            unreadLabel={t('notifications.inbox.unread')}
            typeChip={
                parts.chip ? (
                    <NotificationTypeChip
                        variant={parts.chip}
                        label={t(
                            parts.chip === 'mention'
                                ? 'notifications.inbox.chip.mention'
                                : 'notifications.inbox.chip.thread'
                        )}
                    />
                ) : undefined
            }
            location={parts.location}
            context={parts.context}
            quote={parts.quote}
            body={body}
            selectable={selectable}
            selected={selected}
            onPress={() => onPress(item)}
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        />
    );
};
