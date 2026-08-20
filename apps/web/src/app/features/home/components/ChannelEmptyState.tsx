import { useTranslation } from 'react-i18next';

/**
 * "This place has no chat rooms" — the Chat section's empty body (Figma 3717:23857).
 *
 * Two readings of the same fact, because what the user can DO about it differs:
 *  - `invited`: a guest in someone else's place cannot create a room, so the copy explains that
 *    rooms arrive by invitation and offers the one action that IS theirs — leaving the place, via
 *    the place-info hub.
 *  - `owner`: the create (＋) entry is right above, so a plain nudge to make the first room is
 *    enough.
 *
 * Colours/metrics are the design's: 14px medium, 1.45 line height, -0.07px tracking, description
 * grey for the explanatory lines and foreground for the underlined link.
 */
export interface ChannelEmptyStateProps {
    /** Which reading to render — see the component doc. */
    variant: 'invited' | 'owner';
    /** Invited variant only: opens this place's settings hub (where leaving lives). */
    onOpenPlaceInfo?: () => void;
}

const LINE = 'text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description';

export const ChannelEmptyState = ({ variant, onOpenPlaceInfo }: ChannelEmptyStateProps) => {
    const { t } = useTranslation();

    return (
        // Enters with the list rather than appearing fully formed — the body usually swaps in from
        // the loading skeleton, and a hard cut there reads as a glitch.
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
