import { useTranslation } from 'react-i18next';

export interface ChannelEmptyStateProps {
    variant: 'invited' | 'owner';
    onOpenPlaceInfo?: () => void;
}

const LINE = 'text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description';

export const ChannelEmptyState = ({ variant, onOpenPlaceInfo }: ChannelEmptyStateProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex w-full animate-in flex-col items-center gap-4 px-4 pb-6 pt-4 text-center duration-500 fade-in-0 slide-in-from-bottom-2">
            <p className={`${LINE} whitespace-pre-line`}>
                {variant === 'invited' ? t('channelList.emptyInvited') : t('channelList.empty')}
            </p>

            {variant === 'invited' && onOpenPlaceInfo && (
                <div className="flex flex-col items-center gap-1.5">
                    <p className={LINE}>{t('channelList.emptyInvitedLeaveHint')}</p>
                    <button
                        type="button"
                        onClick={onOpenPlaceInfo}
                        className="text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground underline underline-offset-2 transition-opacity active:opacity-60"
                    >
                        {t('channelList.emptyInvitedPlaceInfo')}
                    </button>
                </div>
            )}
        </div>
    );
};
