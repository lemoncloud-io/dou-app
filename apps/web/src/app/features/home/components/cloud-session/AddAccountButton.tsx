import { useTranslation } from 'react-i18next';

import { IconPlus, SubscriptionBadge } from '@chatic/web-ui-kit';

export const AddAccountButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();

    return (
        <div className="p-4">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-input-border px-[25px] py-[11px]"
            >
                <IconPlus className="size-6 text-foreground" />
                <span className="text-[16px] font-semibold leading-[1.375] tracking-[-0.005em] text-foreground">
                    {t('cloudSessionSheet.addAccount')}
                </span>
                <SubscriptionBadge tier="pro" />
            </button>
        </div>
    );
};
