import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AlertTriangle, Globe, Smartphone } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageShell, isRelayGuest, useCloudSessionCatalog } from '../../../shared';
import { useNow } from '../hooks/useNow';
import { usePairingApproval, type PairingApprovalError } from '../hooks/usePairingApproval';
import { canApprovePairing } from '../utils/devicePairing';
import { formatPairingCode, formatRemaining } from '../utils/pairingCode';
import { pairingTargetOptions, type PairingTargetOption } from '../utils/pairingTargets';
import type { PairingCheck } from '../utils/types';

/** Where the screen was opened from, set by the entry that opened it; back and "done" return there. */
export interface PairingApproveEntry {
    from?: string;
}

const ERROR_KEYS: Record<PairingApprovalError, `pairing.approve.error.${PairingApprovalError}`> = {
    notFound: 'pairing.approve.error.notFound',
    expired: 'pairing.approve.error.expired',
    codeRefused: 'pairing.approve.error.codeRefused',
    targetRefused: 'pairing.approve.error.targetRefused',
    alreadyHandled: 'pairing.approve.error.alreadyHandled',
    unknown: 'pairing.approve.error.unknown',
};

/** A phone asks with its system as the platform; everything else that asks is a browser. */
const isPhonePlatform = (platform: string | undefined): boolean => platform === 'ios' || platform === 'android';

const fieldClass = cn(
    'focus-ring h-12 w-full rounded-lg border bg-background px-3 text-center font-mono text-title tracking-[0.2em] text-foreground outline-none transition-colors',
    'border-control-border focus:border-focus-border disabled:opacity-50'
);

/**
 * The approving side of a pairing, in the desktop app: the person types the code a browser shows,
 * checks that the browser named is the one they opened, picks what it may use, and approves or
 * declines.
 *
 * Offered only in the desktop app (a browser is the requesting side) and only to a session that
 * signed in for itself: a paired session approving would hand on access it was itself only lent.
 */
export const PairingApprovePage = () => {
    const isPaired = runtime.session.useIsPairedSession();
    const { from = '/settings' } = (useLocation().state ?? {}) as PairingApproveEntry;
    if (!canApprovePairing(isPaired)) return <Navigate to={from} replace />;
    return <ApprovalScreen backTo={from} />;
};

const ApprovalScreen = ({ backTo }: { backTo: string }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputId = useId();
    const hintId = useId();

    const onDecided = useCallback(
        (decision: 'approved' | 'denied') => {
            toast({ title: t(decision === 'approved' ? 'pairing.approve.approved' : 'pairing.approve.denied') });
            navigate(backTo);
        },
        [t, navigate, backTo]
    );
    const approval = usePairingApproval({ onDecided });
    const { state } = approval;
    const inputStep = state.step === 'input' || state.step === 'checking';

    return (
        <PageShell
            title={t('pairing.approve.title')}
            backTo={backTo}
            backLabel={backTo === '/account/devices' ? t('pairing.devices.title') : t('settings.title')}
        >
            {inputStep ? (
                <section className="flex flex-col gap-3">
                    <label htmlFor={inputId} className="text-callout font-medium text-foreground">
                        {t('pairing.approve.codeLabel')}
                    </label>
                    {/* No maxLength: a pasted `0734-4168` is nine characters, and the field keeps its digits. */}
                    <input
                        id={inputId}
                        autoFocus
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        value={formatPairingCode(approval.code)}
                        onChange={e => approval.setCode(e.target.value)}
                        disabled={state.step === 'checking'}
                        aria-invalid={approval.error ? true : undefined}
                        aria-describedby={hintId}
                        placeholder="0000-0000"
                        className={fieldClass}
                    />
                    <p id={hintId} className="text-caption text-muted-foreground">
                        {state.step === 'checking' ? t('pairing.approve.checking') : t('pairing.approve.codeHint')}
                    </p>
                    {approval.error && (
                        <p role="alert" className="text-callout text-destructive">
                            {t(ERROR_KEYS[approval.error])}
                        </p>
                    )}
                </section>
            ) : (
                <ConfirmRequest
                    // A new check is a new request: its debug acknowledgement and target choice start over.
                    key={state.check.pairingId}
                    check={state.check}
                    deciding={state.step === 'deciding'}
                    error={approval.error}
                    onApprove={target => void approval.approve(target)}
                    onDeny={() => void approval.deny()}
                    onOtherCode={approval.reset}
                />
            )}
        </PageShell>
    );
};

const ConfirmRequest = ({
    check,
    deciding,
    error,
    onApprove,
    onDeny,
    onOtherCode,
}: {
    check: PairingCheck;
    deciding: boolean;
    error: PairingApprovalError | null;
    onApprove: (target: PairingTargetOption['target']) => void;
    onDeny: () => void;
    onOtherCode: () => void;
}) => {
    const { t } = useTranslation();
    const debugId = useId();
    const now = useNow(true);
    const remaining = check.expiredAt - now;
    const expired = remaining <= 0;
    const isDebug = check.purpose === 'debug';
    const [debugConfirmed, setDebugConfirmed] = useState(false);
    const phone = isPhonePlatform(check.client.platform);

    const { clouds, isPendingClouds } = useCloudSessionCatalog();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const relayGuest = isRelayGuest();
    const { options, defaultKey } = useMemo(
        () =>
            pairingTargetOptions({
                isRelayGuest: relayGuest,
                clouds,
                activeCloudId: selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : null,
            }),
        [relayGuest, clouds, selectedCloudId]
    );
    const [picked, setPicked] = useState<string | null>(null);
    // The default follows the catalog until the person picks; a pick the catalog no longer lists falls back.
    const selected = options.find(option => option.key === picked) ?? options.find(option => option.key === defaultKey);

    const scopeName = (option: PairingTargetOption) => option.cloudName ?? '';
    const blocked = deciding || expired;

    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 rounded-xl border-2 border-primary-ink bg-card p-5">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground">
                        {phone ? <Smartphone size={20} aria-hidden /> : <Globe size={20} aria-hidden />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-caption text-muted-foreground">
                            {t(phone ? 'pairing.approve.phone' : 'pairing.approve.browser')}
                        </span>
                        <span className="truncate text-title text-foreground" data-testid="pairing-client">
                            {check.client.name || t('pairing.approve.unknownClient')}
                        </span>
                    </div>
                </div>
                <p className="text-caption text-muted-foreground" data-testid="pairing-remaining">
                    {expired
                        ? t('pairing.approve.error.expired')
                        : t('pairing.approve.remaining', { time: formatRemaining(remaining) })}
                </p>
                <p className="break-keep text-callout font-medium text-foreground">{t('pairing.approve.onlyYours')}</p>
            </div>

            {isDebug && (
                <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                    <p className="flex items-start gap-2 text-callout text-destructive">
                        <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
                        {t('pairing.approve.debugWarning')}
                    </p>
                    <label
                        htmlFor={debugId}
                        className="flex cursor-pointer items-center gap-2 text-callout text-foreground"
                    >
                        <input
                            id={debugId}
                            type="checkbox"
                            checked={debugConfirmed}
                            onChange={e => setDebugConfirmed(e.target.checked)}
                            className="h-4 w-4 shrink-0 accent-primary"
                        />
                        {t('pairing.approve.debugConfirm')}
                    </label>
                </div>
            )}

            {options.length > 0 ? (
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-overline uppercase text-muted-foreground">
                        {t('pairing.approve.targetLabel')}
                    </legend>
                    {options.map(option => {
                        const isRelay = option.target.type === 'relay';
                        const checked = selected?.key === option.key;
                        return (
                            <label
                                key={option.key}
                                className={cn(
                                    'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                                    checked
                                        ? 'border-primary-ink bg-primary/10'
                                        : 'border-control-border hover:bg-accent'
                                )}
                            >
                                <input
                                    type="radio"
                                    name="pairing-target"
                                    value={option.key}
                                    checked={checked}
                                    onChange={() => setPicked(option.key)}
                                    disabled={blocked}
                                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                                />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="text-callout font-medium text-foreground">
                                        {isRelay
                                            ? t('pairing.approve.target.relay')
                                            : t('pairing.approve.target.cloud', { cloud: scopeName(option) })}
                                    </span>
                                    <span className="text-caption text-muted-foreground">
                                        {isRelay
                                            ? t('pairing.approve.target.relayHint')
                                            : t('pairing.approve.target.cloudHint', { cloud: scopeName(option) })}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </fieldset>
            ) : (
                !isPendingClouds && (
                    <p className="text-callout text-muted-foreground">{t('pairing.approve.noTargets')}</p>
                )
            )}

            {error && (
                <p role="alert" className="text-callout text-destructive">
                    {t(ERROR_KEYS[error])}
                </p>
            )}

            <div className="flex flex-col gap-2">
                {selected && (
                    <Button
                        size="lg"
                        onClick={() => onApprove(selected.target)}
                        disabled={blocked || (isDebug && !debugConfirmed)}
                    >
                        {selected.target.type === 'relay'
                            ? t('pairing.approve.approveRelay')
                            : t('pairing.approve.approveCloud', { cloud: scopeName(selected) })}
                    </Button>
                )}
                <Button size="lg" variant="outline" onClick={onDeny} disabled={blocked}>
                    {t('pairing.approve.deny')}
                </Button>
                <Button variant="link" onClick={onOtherCode} disabled={deciding}>
                    {t('pairing.approve.otherCode')}
                </Button>
            </div>
        </section>
    );
};
