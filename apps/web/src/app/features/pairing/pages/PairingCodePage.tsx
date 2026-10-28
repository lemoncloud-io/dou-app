import { Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';
import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

import { useIsAccountGuest } from '../../../hooks';
import { canGoBackInApp } from '../../../navigation';
import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
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
 *
 * A device asks for a sign-in only while it is signed out, and a guest inside a cloud it entered on its
 * own invite is signed in there: an approval of that same cloud would give it a second identity in it.
 * Such a guest is asked to sign out of the cloud first, and gets the code once it has. DoU Home and a
 * paired cloud are fine — adding another cloud from one is what "Add a cloud with another device" is.
 */
export const PairingCodePage = () => {
    const enabled = useDevicePairingEnabled();
    const isGuest = useIsAccountGuest();
    const [allowed] = useState(() => enabled && isGuest);
    const [inOwnCloud, setInOwnCloud] = useState(() => runtime.session.isInOwnCloudSession());
    if (!allowed) return <Navigate to={ROUTES.mypage.root} replace />;
    if (inOwnCloud) return <SignOutOfCloudFirst onSignedOut={() => setInOwnCloud(false)} />;
    return <PairingCodeScreen />;
};

const SignOutOfCloudFirst = ({ onSignedOut }: { onSignedOut: () => void }) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { logoutCloudSession, isLoggingOutCloudSession } = useLogoutCloudSession();

    const signOut = async () => {
        try {
            await logoutCloudSession();
        } finally {
            // Re-read rather than assume: a failed sign-out leaves the cloud session, and the screen.
            if (!runtime.session.isInOwnCloudSession()) onSignedOut();
        }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('pairing.code.title')} onBack={() => navigate(-1)} />
            <div
                className="flex flex-1 flex-col items-center gap-6 px-6 pt-16 text-center"
                data-testid="pairing-in-cloud"
            >
                <p className="text-[15px] leading-[1.5] text-foreground">{t('pairing.code.inCloud')}</p>
                <button
                    type="button"
                    className="rounded-xl bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
                    disabled={isLoggingOutCloudSession}
                    onClick={() => void signOut()}
                    data-testid="pairing-in-cloud-signout"
                >
                    {t('pairing.code.inCloudSignOut')}
                </button>
            </div>
        </div>
    );
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
                      // A phone signed in this way is a secondary device: it signs out with its approver,
                      // and that is worth saying once, now. A browser tab's sign-in ends with the tab.
                      description: isNative() ? t('pairing.code.doneSecondaryBody') : t('pairing.code.doneRelayBody'),
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
