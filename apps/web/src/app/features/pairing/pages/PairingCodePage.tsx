import { Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

import { useIsAccountGuest } from '../../../hooks';
import { canGoBackInApp } from '../../../navigation';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { useDevicePairingEnabled, useNow } from '../hooks';
import { formatPairingCode, formatRemaining } from '../lib/pairingCode';

interface ReturnState {
    returnTo?: string;
}

/**
 * The requesting device's screen: shows an 8-digit code and its QR, and signs in once a signed-in app
 * approves it — the relay approval with that account, a cloud approval by entering that cloud as a guest.
 *
 * Only a guest reaches it: the relay accepts a code request from a guest session alone. The check is
 * taken once, at mount, because a successful pairing turns this very session into an account.
 */
export const PairingCodePage = () => {
    const enabled = useDevicePairingEnabled();
    const isGuest = useIsAccountGuest();
    const [allowed] = useState(() => enabled && isGuest);
    if (!allowed) return <Navigate to={ROUTES.mypage.root} replace />;
    return <PairingCodeScreen />;
};

const PairingCodeScreen = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { state, restart } = runtime.session.usePairingRequest();
    const now = useNow(state.phase === 'waiting');
    const finished = useRef(false);
    const [thisDevice] = useState(() => runtime.session.pairingClientOf().name);

    useEffect(() => {
        if (state.phase !== 'done' || finished.current) return;
        finished.current = true;
        toast(
            state.target.type === 'cloud'
                ? { title: t('pairing.code.doneCloud') }
                : {
                      title: t('pairing.code.doneRelayTitle', { name: state.approverName ?? '' }),
                      description: t('pairing.code.doneRelayBody'),
                  }
        );
        // The login screen pushed this one; leaving goes back past both, to where the user started.
        const { returnTo } = (location.state ?? {}) as ReturnState;
        if (returnTo && canGoBackInApp()) navigate(-2);
        else navigate(ROUTES.home, { replace: true, transition: true, direction: 'back' });
    }, [state, t, toast, navigate, location.state]);

    const leave = () => navigate(-1);

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('pairing.code.title')} onBack={leave} />
            <div className="flex flex-1 flex-col items-center px-6 pt-8 text-center" data-testid="pairing-code-screen">
                {(state.phase === 'requesting' || state.phase === 'applying' || state.phase === 'done') && (
                    <div className="flex flex-col items-center gap-3 pt-16 text-description">
                        <Loader2 className="animate-spin" size={28} aria-hidden />
                        <p className="text-[14px]">
                            {state.phase === 'requesting' ? t('pairing.code.requesting') : t('pairing.code.applying')}
                        </p>
                    </div>
                )}

                {(state.phase === 'waiting' || state.phase === 'expired') && (
                    <>
                        <p className="text-[15px] leading-[1.5] text-foreground">{t('pairing.code.instruction')}</p>
                        <div
                            className={cn(
                                'mt-6 rounded-2xl bg-white p-4 shadow-sm',
                                state.phase === 'expired' && 'opacity-30'
                            )}
                        >
                            <QRCodeSVG value={state.code} size={176} level="M" data-testid="pairing-qr" />
                        </div>
                        <p
                            className={cn(
                                'mt-5 font-mono text-[34px] font-semibold tracking-[0.12em] text-foreground',
                                state.phase === 'expired' && 'text-muted-foreground line-through'
                            )}
                            data-testid="pairing-code"
                        >
                            {formatPairingCode(state.code)}
                        </p>
                        {state.phase === 'waiting' ? (
                            <>
                                <p className="mt-2 text-[13px] text-description" data-testid="pairing-remaining">
                                    {t('pairing.code.remaining', { time: formatRemaining(state.expiredAt - now) })}
                                </p>
                                <p className="mt-6 text-[13px] leading-[1.5] text-description">
                                    {thisDevice
                                        ? t('pairing.code.checkBrowser', { name: thisDevice })
                                        : t('pairing.code.checkBrowserUnnamed')}
                                </p>
                            </>
                        ) : (
                            <Outcome
                                message={t('pairing.code.expired')}
                                action={t('pairing.code.newCode')}
                                onAction={restart}
                            />
                        )}
                    </>
                )}

                {state.phase === 'denied' && (
                    <Outcome message={t('pairing.code.denied')} action={t('pairing.code.retry')} onAction={restart} />
                )}
                {state.phase === 'lost' && (
                    <Outcome message={t('pairing.code.lost')} action={t('pairing.code.startOver')} onAction={restart} />
                )}
                {state.phase === 'failed' && (
                    <Outcome message={t('pairing.code.failed')} action={t('pairing.code.retry')} onAction={restart} />
                )}
            </div>
        </div>
    );
};

const Outcome = ({ message, action, onAction }: { message: string; action: string; onAction: () => void }) => (
    <div className="mt-6 flex flex-col items-center gap-4" data-testid="pairing-outcome">
        <p className="text-[15px] leading-[1.5] text-foreground">{message}</p>
        <button
            type="button"
            onClick={onAction}
            className="rounded-2xl bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground"
        >
            {action}
        </button>
    </div>
);
