import { useTranslation } from 'react-i18next';

import { IconChevronRight } from '@chatic/web-ui-kit';

import type { InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { canReinviteDm, type DmInviteState } from '../utils/dmInviteState';

interface DmInviteFooterProps {
    /** From `useDmInviteState`. `present` renders nothing. */
    state: DmInviteState;
    /** Live remaining time for the invite `state` refers to. */
    countdown: InviteCountdown | null;
    /** Opens the re-invite form. Omitted while the CTA cannot apply (e.g. an inactive cloud). */
    onReinvite?: () => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Remaining time as `HH:mm:ss`.
 *
 * Days are folded into the hours rather than switching format the way the accept screen does
 * (`InviteExpiryCard`): links this client issues live 24 hours (ADR-0068 결정 4), so the day field is
 * always zero and one format is enough — and if a link ever comes back longer, `72:00:00` still
 * reads correctly instead of silently showing `00:00:00`.
 */
const formatRemaining = ({ days, hours, minutes, seconds }: InviteCountdown): string =>
    `${pad(days * 24 + hours)}:${pad(minutes)}:${pad(seconds)}`;

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

                {/* "초대가 완료되었습니다" = the link went out, NOT that it was accepted. Acceptance
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

                {/* The label and the "{{time}} 남음" frame are the accept screen's own strings — the
                    copy is identical, so it is shared rather than duplicated. */}
                {countdown && (
                    <p
                        className={`text-center text-[14px] font-medium leading-[1.45] tracking-[-0.07px] ${
                            isSpent ? 'text-destructive' : 'text-point-blue'
                        }`}
                    >
                        {`${t('inviteAccept.expiry.label')} ${t('inviteAccept.expiry.remaining', {
                            time: formatRemaining(countdown),
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
