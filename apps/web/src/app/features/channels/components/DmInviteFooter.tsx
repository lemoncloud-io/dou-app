import { useTranslation } from 'react-i18next';

import { IconChevronRight } from '@chatic/web-ui-kit';

import type { InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { formatCountdownClock } from '../../invite/utils/countdownClock';
import { canReinviteDm, type DmInviteState } from '../utils/dmInviteState';

interface DmInviteFooterProps {
    /** From `useDmInviteState`. `present` renders nothing. */
    state: DmInviteState;
    /** Live remaining time for the invite `state` refers to. */
    countdown: InviteCountdown | null;
    /** Opens the re-invite form. Omitted while the CTA cannot apply (e.g. an inactive cloud). */
    onReinvite?: () => void;
}

/**
 * What a 1:1 room says once the peer is gone: why the composer is locked, where the invite stands,
 * and how to bring them back (Figma 4041-33606 / 4062-14154 / 4062-14493 / 4064-14672).
 *
 * Pinned below the newest message, and derived rather than stored — the countdown ticks and the
 * whole block disappears the moment the peer is back, so it states the room's CURRENT condition and
 * is not part of its history. The in-stream join/leave notices remain the historical record.
 *
 * Presentational only: it renders the state it is handed and never decides one
 * (see `resolveDmInviteState`).
 */
export const DmInviteFooter = ({ state, countdown, onReinvite }: DmInviteFooterProps) => {
    const { t } = useTranslation();

    if (state.kind === 'present') return null;

    // Only the expired line turns red — a live link is informational (Figma point_blue).
    const isSpent = state.kind === 'expired';
    const showCta = canReinviteDm(state) && !!onReinvite;

    return (
        <div className="flex flex-col items-stretch gap-2 px-4 pb-1 pt-2">
            <div className="flex flex-col items-center gap-1">
                {/* Always present: the peer being gone is the reason this block exists at all. */}
                <p className="text-center text-[13px] leading-[1.45] tracking-[-0.065px] text-description">
                    {t('chat.dm.footer.leftHint')}
                </p>

                {/* "Invite sent" = the link went out, NOT that it was accepted. Acceptance
                    arrives as the join system message, after which this block is gone. */}
                {(state.kind === 'pending' || state.kind === 'expired') && (
                    <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground">
                        {t('chat.dm.footer.inviteSent')}
                    </p>
                )}

                {state.kind === 'rejected' && (
                    <>
                        <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground">
                            {t('chat.dm.footer.rejected')}
                        </p>
                        <p className="text-center text-[13px] leading-[1.45] tracking-[-0.065px] text-description">
                            {t('chat.dm.footer.rejectedHint')}
                        </p>
                    </>
                )}

                {state.kind === 'expired' && (
                    <>
                        <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground">
                            {t('chat.dm.footer.expired')}
                        </p>
                        <p className="text-center text-[13px] leading-[1.45] tracking-[-0.065px] text-description">
                            {t('chat.dm.footer.expiredHint')}
                        </p>
                    </>
                )}

                {/* The label and the "{{time}} remaining" frame are the accept screen's own strings — the
                    copy is identical, so it is shared rather than duplicated. */}
                {countdown && (
                    <p
                        className={`text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] ${
                            isSpent ? 'text-destructive' : 'text-point-blue'
                        }`}
                    >
                        {`${t('inviteAccept.expiry.label')} ${t('inviteAccept.expiry.remaining', {
                            time: formatCountdownClock(countdown),
                        })}`}
                    </p>
                )}
            </div>

            {/* Withheld while a link is live: two working codes for one person is the state the
                sender flow retires before reissuing. Figma's pending frame has no button either. */}
            {showCta && (
                <button
                    onClick={onReinvite}
                    className="mt-1 flex h-[50px] w-full items-center justify-center gap-1.5 rounded-full border border-input-border text-[16px] font-semibold text-foreground"
                >
                    {t('chat.dm.footer.reinvite')}
                    <IconChevronRight className="size-[18px]" />
                </button>
            )}
        </div>
    );
};
