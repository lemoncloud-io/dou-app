import { useTranslation } from 'react-i18next';

import { AlertDialog, TextField } from '@chatic/web-ui-kit';
import { cn } from '@chatic/lib/utils';

import { formatCountdown } from '../../../utils';
// Concrete module, not the ui/components barrel: CountrySelect is deliberately kept out of it so
// libphonenumber's metadata stays off the eager path.
import { CountrySelect } from '../../../ui/components/CountrySelect';
import type { PhoneVerifyFieldsState } from '../hooks/usePhoneVerify';

/** Below this the countdown turns red (Figma 3428-60171 / 3432-61204 / 3430-60970). */
const IMMINENT_SECONDS = 60;

interface PhoneVerifyFieldsProps {
    state: PhoneVerifyFieldsState;
    /**
     * Focus the phone field on mount. Full-screen only: in a bottom sheet the keyboard would open
     * over the pinned footer CTA the moment the sheet appears.
     */
    autoFocusPhone?: boolean;
}

/** In-field / helper-row text link. Blue is the actionable accent, dark is a secondary action. */
const InlineAction = ({
    label,
    onClick,
    enabled,
    accent = false,
}: {
    label: string;
    onClick: () => void;
    enabled: boolean;
    accent?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!enabled}
        className={cn(
            'whitespace-nowrap text-[14px] font-medium underline',
            !enabled ? 'text-placeholder' : accent ? 'text-point-blue' : 'text-foreground'
        )}
    >
        {label}
    </button>
);

/**
 * The phone-verification input body — the two fields the design shares between its full-screen and
 * bottom-sheet presentations (Figma 3421-59180 · 3586-16255 hold an identical "General Input" pair).
 * Chrome (title, hero copy, submit placement) belongs to the shell; this renders only the fields,
 * the dev delivery switches and the over-limit dialog.
 *
 * The design puts each field's action inside the border (`trailing`) and the countdown opposite the
 * helper text (`helperTrailing`) — both are TextField slots, so no bespoke input markup is needed.
 */
export const PhoneVerifyFields = ({ state, autoFocusPhone = false }: PhoneVerifyFieldsProps) => {
    const { t } = useTranslation();
    const secondsLeft = state.countdown?.secondsLeft ?? 0;

    return (
        <>
            <div className="flex flex-col gap-6">
                <TextField
                    label={t('phoneVerify.phoneLabel')}
                    required
                    value={state.phoneInput}
                    onChange={state.onPhoneChange}
                    placeholder={t('phoneVerify.phonePlaceholder')}
                    type="tel"
                    inputMode="numeric"
                    autoFocus={autoFocusPhone}
                    error={state.phoneError || undefined}
                    description={t('phoneVerify.digitsOnly')}
                    // The country lives INSIDE the field's border, so the pair reads as one input
                    // group and the focus ring covers both (Figma "General Input" stays one row).
                    leading={<CountrySelect value={state.country} onChange={state.onCountryChange} />}
                    trailing={
                        <InlineAction
                            label={t('phoneVerify.sendCode')}
                            onClick={state.onRequestCode}
                            enabled={state.canRequestCode}
                            accent
                        />
                    }
                />

                <TextField
                    label={t('phoneVerify.codeLabel')}
                    required
                    value={state.otp}
                    onChange={state.onOtpChange}
                    placeholder={t('phoneVerify.codePlaceholder')}
                    inputMode="numeric"
                    disabled={!state.codeSent}
                    error={state.codeError || undefined}
                    description={state.codeDescription}
                    trailing={
                        <InlineAction
                            label={t('phoneVerify.resend')}
                            onClick={() => state.onResend('resend')}
                            enabled={state.codeSent && !state.isBusy}
                        />
                    }
                    helperTrailing={
                        state.codeSent && (
                            <span className="flex items-center gap-[6px] text-[12px] font-medium leading-[18px]">
                                <span
                                    className={cn(
                                        secondsLeft <= IMMINENT_SECONDS ? 'text-destructive' : 'text-point-blue'
                                    )}
                                >
                                    {formatCountdown(secondsLeft)}
                                </span>
                                <InlineAction
                                    label={t('phoneVerify.extend')}
                                    onClick={() => state.onResend('extend')}
                                    enabled={!state.isBusy}
                                    accent
                                />
                            </span>
                        )
                    }
                />

                {state.showDevSwitches && (
                    <div className="mx-4 flex flex-col gap-2 rounded-[10px] border border-dashed border-input-border p-3">
                        <span className="text-[12px] font-semibold text-description">
                            {t('phoneVerify.devDelivery')}
                        </span>
                        <label className="flex items-center gap-2 text-[13px] text-label">
                            <input
                                type="checkbox"
                                checked={state.devDryRun}
                                onChange={e => state.onDevDryRunChange(e.target.checked)}
                            />
                            {t('phoneVerify.devDryRun')}
                        </label>
                        <label className="flex items-center gap-2 text-[13px] text-label">
                            <input
                                type="checkbox"
                                checked={state.devSlack}
                                onChange={e => state.onDevSlackChange(e.target.checked)}
                            />
                            {t('phoneVerify.devSlack')}
                        </label>
                        {/* Not a client-side skip: this proves with the code development backends
                            accept, through the same calls a typed code takes. Needs a code to have
                            been requested first — with dryRun on, that request sends no SMS, so the
                            two together take the phone out of the loop completely. */}
                        <button
                            type="button"
                            onClick={state.onDevBypass}
                            disabled={!state.canDevBypass}
                            className="mt-1 h-9 rounded-[8px] border border-input-border text-[13px] font-semibold text-label disabled:opacity-40"
                        >
                            {t('phoneVerify.devBypass')}
                        </button>
                    </div>
                )}
            </div>

            <AlertDialog
                open={state.limit !== null}
                onOpenChange={open => !open && state.onDismissLimit()}
                title={t(`phoneVerify.limit.${state.limit ?? 'resend'}.title`)}
                description={t(`phoneVerify.limit.${state.limit ?? 'resend'}.description`)}
                confirmLabel={t('common.confirm')}
                onConfirm={state.onDismissLimit}
            />
        </>
    );
};
