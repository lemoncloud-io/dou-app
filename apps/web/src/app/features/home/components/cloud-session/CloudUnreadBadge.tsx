import { useTranslation } from 'react-i18next';

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
