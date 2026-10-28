import { Camera, Globe, Loader2, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

import { useCloudSessionCatalog, useIsAccountGuest } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { useDevicePairingEnabled, useNow, usePairingApproval } from '../hooks';
import { formatPairingCode, formatRemaining } from '../lib/pairingCode';
import { pairingTargetOptions, type PairingTargetOption } from '../lib/pairingTargets';
import { scanPairingQr, type PairingQrScan } from '../lib/scanPairingQr';

/**
 * The approving device's screen: a code from a browser (or another phone) typed or scanned in, its
 * requester shown, and an approval for one target.
 *
 * Only inside the app, signed in to an account, on a session that is not itself a secondary device.
 * The server would accept an approval from a browser's phone login, and a guest app's approval of its
 * invited clouds, too — the rule that approvals come from signed-in apps is the screen's, so the entry
 * and this page are where it is kept.
 */
export const PairingApprovePage = () => {
    const enabled = useDevicePairingEnabled();
    const paired = runtime.session.useIsPairedSession();
    const isGuest = useIsAccountGuest();
    if (!enabled || !isNative() || isGuest || paired) return <Navigate to={ROUTES.mypage.root} replace />;
    return <PairingApproveScreen />;
};

const SCAN_MESSAGE: Partial<Record<PairingQrScan['kind'], string>> = {
    oldApp: 'pairing.approve.scanOldApp',
    notOurs: 'pairing.approve.scanNotOurs',
    noQr: 'pairing.approve.scanNoQr',
};

const PairingApproveScreen = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { code, setCode, state, error, approve, deny, retry, reset } = usePairingApproval();
    const isRelayGuest = useIsAccountGuest();
    const { clouds } = useCloudSessionCatalog();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const [scanNote, setScanNote] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);

    const { options, defaultKey } = useMemo(
        () => pairingTargetOptions({ isRelayGuest, clouds, activeCloudId: selectedCloudId }),
        [isRelayGuest, clouds, selectedCloudId]
    );

    useEffect(() => {
        if (state.step === 'approved') {
            toast({ title: t('pairing.approve.approved') });
            navigate(-1);
        } else if (state.step === 'denied') {
            toast({ title: t('pairing.approve.denied') });
            navigate(-1);
        }
    }, [state.step, t, toast, navigate]);

    const scan = async () => {
        setScanNote(null);
        setScanning(true);
        try {
            const result = await scanPairingQr();
            if (result.kind === 'code') setCode(result.code);
            else if (SCAN_MESSAGE[result.kind]) setScanNote(t(SCAN_MESSAGE[result.kind] as string));
        } catch {
            setScanNote(t('pairing.approve.scanNoQr'));
        } finally {
            setScanning(false);
        }
    };

    const check = state.step === 'confirm' || state.step === 'deciding' ? state.check : null;

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('pairing.approve.title')} onBack={() => navigate(-1)} />
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pt-6 pb-10">
                {!check && (
                    <>
                        <p className="text-[15px] leading-[1.5] text-foreground">{t('pairing.approve.instruction')}</p>
                        <input
                            value={formatPairingCode(code)}
                            onChange={event => setCode(event.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="0000-0000"
                            aria-label={t('pairing.approve.codeLabel')}
                            data-testid="pairing-approve-input"
                            disabled={state.step === 'checking'}
                            className="w-full rounded-2xl border border-input-border bg-transparent px-4 py-4 text-center font-mono text-[28px] tracking-[0.12em] text-foreground"
                        />
                        <button
                            type="button"
                            onClick={() => void scan()}
                            disabled={scanning || state.step === 'checking'}
                            data-testid="pairing-approve-scan"
                            className="flex items-center justify-center gap-2 rounded-2xl border border-input-border py-3 text-[15px] font-medium text-foreground disabled:opacity-50"
                        >
                            <Camera size={18} aria-hidden />
                            {t('pairing.approve.scan')}
                        </button>
                        {state.step === 'checking' && (
                            <Loader2 className="mx-auto animate-spin" size={24} aria-hidden />
                        )}
                        {scanNote && <p className="text-[13px] text-description">{scanNote}</p>}
                    </>
                )}

                {error && (
                    <p className="text-[14px] text-destructive" role="alert" data-testid="pairing-approve-error">
                        {t(`pairing.approve.errors.${error}`)}
                    </p>
                )}
                {error === 'unknown' && !check && (
                    <button
                        type="button"
                        onClick={retry}
                        className="self-start text-[14px] text-primary"
                        data-testid="pairing-approve-retry"
                    >
                        {t('pairing.code.retry')}
                    </button>
                )}

                {check && (
                    <ConfirmStep
                        check={check}
                        options={options}
                        defaultKey={defaultKey}
                        busy={state.step === 'deciding'}
                        onApprove={approve}
                        onDeny={deny}
                        onCancel={reset}
                    />
                )}
            </div>
        </div>
    );
};

const ConfirmStep = ({
    check,
    options,
    defaultKey,
    busy,
    onApprove,
    onDeny,
    onCancel,
}: {
    check: { purpose: string; client: { name?: string; platform?: string }; expiredAt: number };
    options: PairingTargetOption[];
    defaultKey: string | null;
    busy: boolean;
    onApprove: (target: PairingTargetOption['target']) => void;
    onDeny: () => void;
    onCancel: () => void;
}) => {
    const { t } = useTranslation();
    const now = useNow(true);
    const [selected, setSelected] = useState<string | null>(defaultKey);
    const [debugConfirmed, setDebugConfirmed] = useState(false);
    const isPhone = check.client.platform === 'ios' || check.client.platform === 'android';
    const isDebug = check.purpose === 'debug';
    const choice = options.find(option => option.key === selected) ?? null;

    return (
        <div className="flex flex-col gap-5" data-testid="pairing-approve-confirm">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-input-border px-5 py-6 text-center">
                {isPhone ? <Smartphone size={28} aria-hidden /> : <Globe size={28} aria-hidden />}
                <p className="text-[13px] text-description">
                    {isPhone ? t('pairing.approve.requesterPhone') : t('pairing.approve.requesterBrowser')}
                </p>
                <p className="text-[20px] font-semibold text-foreground" data-testid="pairing-approve-client">
                    {check.client.name || t('pairing.approve.unknownClient')}
                </p>
                <p className="text-[13px] text-description">
                    {t('pairing.code.remaining', { time: formatRemaining(check.expiredAt - now) })}
                </p>
                <p className="text-[13px] leading-[1.5] text-foreground">{t('pairing.approve.onlyYours')}</p>
            </div>

            {isDebug && (
                <div
                    className="flex flex-col gap-3 rounded-2xl bg-destructive/10 px-4 py-3"
                    data-testid="pairing-approve-debug"
                >
                    <p className="text-[14px] text-destructive">{t('pairing.approve.debugWarning')}</p>
                    <label className="flex items-center gap-2 text-[14px] text-foreground">
                        <input
                            type="checkbox"
                            checked={debugConfirmed}
                            onChange={event => setDebugConfirmed(event.target.checked)}
                            data-testid="pairing-approve-debug-confirm"
                        />
                        {t('pairing.approve.debugConfirm')}
                    </label>
                </div>
            )}

            {options.length === 0 ? (
                <p className="text-[15px] text-foreground" data-testid="pairing-approve-no-target">
                    {t('pairing.approve.noTarget')}
                </p>
            ) : (
                <div className="flex flex-col gap-2" role="radiogroup">
                    {options.map(option => (
                        <label
                            key={option.key}
                            className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3',
                                selected === option.key ? 'border-primary' : 'border-input-border'
                            )}
                        >
                            <input
                                type="radio"
                                name="pairing-target"
                                checked={selected === option.key}
                                onChange={() => setSelected(option.key)}
                                data-testid={`pairing-target-${option.key}`}
                                className="mt-1"
                            />
                            <span className="text-[14px] leading-[1.5] text-foreground">
                                {option.target.type === 'relay'
                                    ? t('pairing.scope.relayOption')
                                    : t('pairing.scope.cloudOption', { cloud: option.cloudName })}
                            </span>
                        </label>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-2">
                {choice && (
                    <button
                        type="button"
                        onClick={() => onApprove(choice.target)}
                        disabled={busy || (isDebug && !debugConfirmed)}
                        data-testid="pairing-approve-submit"
                        className="rounded-2xl bg-primary py-[14px] text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        {choice.target.type === 'relay'
                            ? t('pairing.scope.relayApprove')
                            : t('pairing.scope.cloudApprove', { cloud: choice.cloudName })}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onDeny}
                    disabled={busy}
                    data-testid="pairing-approve-deny"
                    className="rounded-2xl border border-input-border py-[14px] text-[15px] font-medium text-foreground disabled:opacity-50"
                >
                    {t('pairing.approve.deny')}
                </button>
                <button type="button" onClick={onCancel} disabled={busy} className="py-2 text-[14px] text-description">
                    {t('pairing.approve.otherCode')}
                </button>
            </div>
        </div>
    );
};
