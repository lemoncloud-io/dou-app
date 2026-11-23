import { useTranslation } from 'react-i18next';

import { AlertDialog, TextField } from '@chatic/web-ui-kit';
import { cn } from '@chatic/ui-kit';

import { formatCountdown } from '../../../utils';
import { CountrySelect } from '../../../ui/components/CountrySelect';
import { InlineAction } from '../../../ui/components/InlineAction';
import type { PhoneVerifyFieldsState } from '../hooks/usePhoneVerify';

const IMMINENT_SECONDS = 60;

interface PhoneVerifyFieldsProps {
    state: PhoneVerifyFieldsState;
    autoFocusPhone?: boolean;
}

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
                                id="dev-delivery-dry-run"
                                type="checkbox"
                                checked={state.devDryRun}
                                onChange={e => state.onDevDryRunChange(e.target.checked)}
                            />
                            {t('phoneVerify.devDryRun')}
                        </label>
                        <label className="flex items-center gap-2 text-[13px] text-label">
                            <input
                                id="dev-delivery-slack"
                                type="checkbox"
                                checked={state.devSlack}
                                onChange={e => state.onDevSlackChange(e.target.checked)}
                            />
                            {t('phoneVerify.devSlack')}
                        </label>
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
