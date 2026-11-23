import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { FloatingButton } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { usePhoneVerify, type PhoneVerifyShellProps } from '../hooks/usePhoneVerify';
import { PhoneVerifyBanner } from './PhoneVerifyBanner';
import { PhoneVerifyFields } from './PhoneVerifyFields';

export interface PhoneVerifyScreenProps extends PhoneVerifyShellProps {
    context: 'invite-accept' | 'invite-create';
}

export const PhoneVerifyScreen = (props: PhoneVerifyScreenProps) => {
    const { t } = useTranslation();
    const { context, onClose } = props;
    const { fields, submit } = usePhoneVerify(props);

    return (
        <Dialog open onOpenChange={value => !value && onClose()}>
            <DialogContent
                className="grid-rows-[minmax(0,1fr)] top-[50%] h-full max-h-none max-w-app rounded-none p-0 sm:rounded-none"
                hideClose
            >
                <DialogTitle className="sr-only">{t('phoneVerify.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('phoneVerify.title')}</DialogDescription>

                <div className="flex h-full min-w-0 flex-col pt-safe-top">
                    <div className="flex h-[60px] shrink-0 items-center justify-end px-4">
                        <button onClick={onClose} className="-mr-1 rounded-full p-1" aria-label={t('common.close')}>
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
                        <div className="flex flex-col gap-4 px-4">
                            <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                                {context === 'invite-accept'
                                    ? t('phoneVerify.descriptionInviteAccept')
                                    : t('phoneVerify.descriptionInviteCreate')}
                            </h2>
                            <p className="whitespace-pre-line text-center text-[14px] font-medium leading-[20px] text-description">
                                {t('phoneVerify.privacyNote')}
                            </p>
                        </div>

                        <PhoneVerifyBanner onClose={onClose} />

                        <PhoneVerifyFields state={fields} autoFocusPhone />
                    </div>

                    <div className="shrink-0">
                        <FloatingButton
                            label={t(submit.isRetry ? 'phoneVerify.retry' : 'phoneVerify.complete')}
                            loading={submit.loading}
                            disabled={submit.disabled}
                            onClick={submit.onSubmit}
                        />
                        <KeyboardSafeAreaSpacer />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
