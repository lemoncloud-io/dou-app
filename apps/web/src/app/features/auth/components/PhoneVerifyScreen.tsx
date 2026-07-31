import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { Button } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { usePhoneVerify, type PhoneVerifyShellProps } from '../hooks/usePhoneVerify';
import { PhoneVerifyBanner } from './PhoneVerifyBanner';
import { PhoneVerifyFields } from './PhoneVerifyFields';

export interface PhoneVerifyScreenProps extends PhoneVerifyShellProps {
    /** Picks the hero copy. Only this shell has a hero, so only this shell takes it. */
    context: 'invite-accept' | 'invite-create';
}

/**
 * Full-screen phone verification — the shell the ACCEPT flow uses (Track C's RelayInviteAccept).
 * Chrome only: a top-right close, the centered hero, the account-split banner and a pinned CTA. All
 * behaviour lives in `usePhoneVerify`; the fields come from `PhoneVerifyFields`.
 *
 * Layout follows Figma 3421-59180 and siblings. The account-split banner sits here rather than in
 * the fields because the backend guide mandates it on the accept screen specifically, and the
 * sheet presentation deliberately omits it (ADR-0034 결정 4).
 *
 * See apps/web/docs/feature/auth/phone-verification.md.
 */
export const PhoneVerifyScreen = (props: PhoneVerifyScreenProps) => {
    const { t } = useTranslation();
    const { context, onClose } = props;
    const { fields, submit } = usePhoneVerify(props);

    return (
        <Dialog open onOpenChange={value => !value && onClose()}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('phoneVerify.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('phoneVerify.title')}</DialogDescription>

                <div className="flex h-full flex-col pt-safe-top">
                    <div className="flex h-[60px] shrink-0 items-center justify-end px-4">
                        <button onClick={onClose} className="-mr-1 rounded-full p-1" aria-label="close">
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex flex-1 flex-col gap-8 overflow-y-auto">
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

                        <div className="px-4">
                            <PhoneVerifyBanner onClose={onClose} />
                        </div>

                        <PhoneVerifyFields state={fields} autoFocusPhone />
                    </div>

                    <div className="shrink-0 px-4 pb-safe-bottom pt-3">
                        <Button
                            tone="green"
                            size="lg"
                            fullWidth
                            loading={submit.loading}
                            disabled={submit.disabled}
                            onClick={submit.onSubmit}
                        >
                            {t(submit.isRetry ? 'phoneVerify.retry' : 'phoneVerify.complete')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
