import { useTranslation } from 'react-i18next';

interface ReadStatusProps {
    memberNo: number;
    readCount: number;
}

export const ReadStatus = ({ memberNo, readCount }: ReadStatusProps) => {
    const { t } = useTranslation();
    const unreadCount = memberNo - readCount;

    // 1:1 채팅
    if (memberNo <= 2) {
        return (
            <span className="font-medium text-foreground">
                {readCount > 0 ? t('chat.room.read') : t('chat.room.unread')}
            </span>
        );
    }

    // 그룹 채팅 - 모두 읽음
    if (unreadCount === 0) {
        return <span className="font-medium text-foreground">{t('chat.room.readCount', { count: readCount })}</span>;
    }

    // 그룹 채팅 - 일부 안읽음
    return (
        <span className="font-medium text-foreground">
            {t('chat.room.readCount', { count: readCount })}
            <span className="mx-0.5 text-muted-foreground/50">•</span>
            {t('chat.room.unreadCount', { count: unreadCount })}
        </span>
    );
};
