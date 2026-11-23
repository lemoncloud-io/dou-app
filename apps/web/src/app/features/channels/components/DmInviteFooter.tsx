import { useTranslation } from 'react-i18next';

import { IconChevronRight } from '@chatic/web-ui-kit';

import type { InviteCountdown } from '../../invite/hooks/useInviteCountdown';
import { formatCountdownClock } from '../../invite/utils/countdownClock';
import { canReinviteDm, type DmInviteState } from '../utils/dmInviteState';

interface DmInviteFooterProps {
    state: DmInviteState;
    countdown: InviteCountdown | null;
    onReinvite?: () => void;
}

export const DmInviteFooter = ({ state, countdown, onReinvite }: DmInviteFooterProps) => {
    const { t } = useTranslation();

    if (state.kind === 'present') return null;

    const isSpent = state.kind === 'expired';
    const showCta = canReinviteDm(state) && !!onReinvite;

    return (
        <div className="flex flex-col items-stretch gap-2 px-4 pb-1 pt-2">
            <div className="flex flex-col items-center gap-1">
                <p className="text-center text-[13px] leading-[1.45] tracking-[-0.065px] text-description">
                    {t('chat.dm.footer.leftHint')}
                </p>

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
