import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { QRCodeSVG } from 'qrcode.react';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

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

/**
 * Leaving the screen before it finished. A guest this screen registered is signed out on the way,
 * which reloads to Welcome: backing out is not choosing to be a guest. Any other session just goes
 * back to Welcome.
 */
/** Code screens mounted right now — strict mode unmounts and remounts one at once. */
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
                // The hold stays until the sign-out has run: released first, the router would open the app
                // as the guest for as long as the logout takes. The logout reloads; the release matters on
                // failure, where the guest is all there is to land in.
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
            // Navigate first: releasing the hold drops this route from the signed-in branch.
            if (navigateAway) navigate('/auth/welcome');
            store.release();
        },
        [navigate, signOutGuest]
    );
};

/**
 * The browser's "sign in with another device" screen: it shows an 8-digit code and its QR, and signs in
 * once a signed-in app approves it — a relay approval with that account, a cloud approval by entering
 * that cloud as a guest.
 *
 * The relay takes a code request from a guest session only, and a browser on Welcome has no session at
 * all. So the screen runs in two phases. Signed out, it signs in as a guest and shows a spinner; the
 * hold it takes first keeps `/auth/pair` routed once that sign-in flips the router to its signed-in
 * branch. The flip remounts the page, so the code request (`usePairingRequest`) is mounted only in the
 * second phase, signed in, where it is mounted once.
 *
 * An account that is already signed in is turned away: it has nothing to pair. Judged once, on arrival,
 * because a relay approval turns this very session into an account.
 */
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

/** Phase one: register this browser as a guest, once. The hold goes first so the flip keeps the page. */
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

/** Phase two, signed in as a guest: ask for a code, show it, and finish once it is approved. */
const PairingCodeScreen = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const leave = useLeavePairing();
    const { state, restart } = runtime.session.usePairingRequest();
    const now = useNow(state.phase === 'waiting');
    const finished = useRef(false);
    const [thisDevice] = useState(() => runtime.session.pairingClientOf().name);

    // Leaving by the browser's own Back (or any route change) skips `onBack`: undo the same way, or the
    // hold would keep `/auth/pair` routed and the guest this screen registered would land in the app.
    // Judged a tick after the unmount: strict mode's remount has mounted the screen again by then.
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
        // Navigate first: releasing the hold drops this route from the signed-in branch.
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
                    {/* The QR sits on white in either theme: a scanner reads dark modules on a light field. */}
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
                            // Larger than any type step: the code is read across a desk, off a screen.
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
