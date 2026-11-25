import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { QRCodeSVG } from 'qrcode.react';

import { logger } from '@chatic/bridges';
import { cn, Button, toast } from '@chatic/ui-kit';
import { runtime } from '@chatic/runtime-react';

import { isRelayGuest } from '../../../shared';
import { AuthCard } from '../../auth/components/AuthCard';
import { useGuestLogin } from '../../auth/hooks/useGuestLogin';
import { useSignOutGuest } from '../../auth/hooks/useSignOutGuest';
import { useNow } from '../hooks/useNow';
import { usePairingCodePageStore } from '../stores/usePairingCodePageStore';
import { formatPairingCode, formatRemaining } from '../utils/pairingCode';

const Spinner = ({ label }: { label: string }) => (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <span
            aria-hidden
            className="block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none"
        />
        <p className="text-callout">{label}</p>
    </div>
);

const Outcome = ({ message, action, onAction }: { message: string; action: string; onAction: () => void }) => (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="pairing-outcome">
        <p role="alert" className="text-callout text-foreground">
            {message}
        </p>
        <Button size="lg" className="w-full" onClick={onAction}>
            {action}
        </Button>
    </div>
);

let mountedScreens = 0;

const useLeavePairing = () => {
    const navigate = useNavigate();
    const signOutGuest = useSignOutGuest();
    return useCallback(
        async ({ navigateAway = true }: { navigateAway?: boolean } = {}) => {
            const store = usePairingCodePageStore.getState();
            const signedIn = runtime.session.getIdentityContext().isAuthenticated;
            if (signedIn && store.registeredGuest && isRelayGuest()) {
                store.startLeaving();
                try {
                    await signOutGuest();
                } catch (error) {
                    logger.warn('AUTH', '[PairingCodePage] signing out the guest of a left pairing failed', { error });
                    navigate('/', { replace: true });
                } finally {
                    usePairingCodePageStore.getState().release();
                }
                return;
            }
            if (navigateAway) navigate('/auth/welcome');
            store.release();
        },
        [navigate, signOutGuest]
    );
};

export const PairingCodePage = () => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const leaving = usePairingCodePageStore(s => s.leaving);
    const [allowed] = useState(() => !isAuthenticated || usePairingCodePageStore.getState().held || isRelayGuest());

    if (!allowed) return <Navigate to="/" replace />;
    if (leaving) return <LeavingCard />;
    return isAuthenticated ? <PairingCodeScreen /> : <GuestSignIn />;
};

const LeavingCard = () => {
    const { t } = useTranslation();
    return (
        <AuthCard title={t('pairing.code.title')} subtitle={t('pairing.code.subtitle')}>
            <Spinner label={t('pairing.code.leaving')} />
        </AuthCard>
    );
};

const GuestSignIn = () => {
    const { t } = useTranslation();
    const leave = useLeavePairing();
    const { submit, isError } = useGuestLogin();
    const hold = usePairingCodePageStore(s => s.hold);
    const started = useRef(false);

    const start = useCallback(() => {
        hold(true);
        void submit();
    }, [hold, submit]);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        start();
    }, [start]);

    return (
        <AuthCard title={t('pairing.code.title')} subtitle={t('pairing.code.subtitle')} onBack={() => void leave()}>
            {isError ? (
                <Outcome message={t('pairing.code.prepareFailed')} action={t('pairing.code.retry')} onAction={start} />
            ) : (
                <Spinner label={t('pairing.code.preparing')} />
            )}
        </AuthCard>
    );
};

const PairingCodeScreen = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const leave = useLeavePairing();
    const { state, restart } = runtime.session.usePairingRequest();
    const now = useNow(state.phase === 'waiting');
    const finished = useRef(false);
    const [thisDevice] = useState(() => runtime.session.pairingClientOf().name);

    const leaveRef = useRef(leave);
    leaveRef.current = leave;
    useEffect(() => {
        mountedScreens++;
        return () => {
            mountedScreens--;
            setTimeout(() => {
                const store = usePairingCodePageStore.getState();
                if (mountedScreens > 0 || finished.current || !store.held || store.leaving) return;
                void leaveRef.current({ navigateAway: false });
            }, 0);
        };
    }, []);

    useEffect(() => {
        if (state.phase !== 'done' || finished.current) return;
        finished.current = true;
        toast(
            state.target.type === 'cloud'
                ? { title: t('pairing.code.doneCloud') }
                : {
                      title: state.approverName
                          ? t('pairing.code.doneRelayTitle', { name: state.approverName })
                          : t('pairing.code.doneRelayTitleUnnamed'),
                      description: t('pairing.code.doneRelayBody'),
                  }
        );
        navigate('/', { replace: true });
        usePairingCodePageStore.getState().release();
    }, [state, t, navigate]);

    const showsCode = state.phase === 'waiting' || state.phase === 'expired';

    return (
        <AuthCard title={t('pairing.code.title')} subtitle={t('pairing.code.subtitle')} onBack={() => void leave()}>
            {(state.phase === 'requesting' || state.phase === 'applying' || state.phase === 'done') && (
                <Spinner
                    label={state.phase === 'requesting' ? t('pairing.code.requesting') : t('pairing.code.applying')}
                />
            )}

            {showsCode && (
                <div className="flex flex-col items-center gap-3 text-center">
                    <div
                        className={cn(
                            'rounded-xl border border-border bg-white p-3',
                            state.phase === 'expired' && 'opacity-30'
                        )}
                    >
                        <QRCodeSVG value={state.code} size={168} level="M" data-testid="pairing-qr" />
                    </div>
                    <p
                        className={cn(
                            'font-mono text-[2rem] font-semibold leading-10 tracking-[0.12em] text-foreground',
                            state.phase === 'expired' && 'text-muted-foreground line-through'
                        )}
                        data-testid="pairing-code"
                    >
                        {formatPairingCode(state.code)}
                    </p>
                    {state.phase === 'waiting' ? (
                        <>
                            <p className="text-caption text-muted-foreground" data-testid="pairing-remaining">
                                {t('pairing.code.remaining', { time: formatRemaining(state.expiredAt - now) })}
                            </p>
                            <p className="break-keep text-caption text-muted-foreground">
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
                </div>
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
        </AuthCard>
    );
};
