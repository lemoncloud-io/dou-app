import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { FloatingButton } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

// Concrete module, not the layouts root: that re-exports route layouts which pull web-core,
// unloadable under the jsdom test setup.
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
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
            {/* `grid-rows-[minmax(0,1fr)]` is what makes this a real full-screen surface rather than a
                box that grows with its content. DialogContent is a `grid`, and an auto row sizes to
                its item's max-content — so the column below ignored the dialog's height, the footer
                was pushed past the bottom edge, and the body never became scrollable (measured: the
                CTA landed 10px below a 640px viewport, and 310px below it once the keyboard was up).
                Pinning the row to `minmax(0,1fr)` clamps it to the dialog, which is also what lets
                the `min-h-0`/`min-w-0` below take effect. */}
            <DialogContent className="grid-rows-[minmax(0,1fr)] h-full rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('phoneVerify.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('phoneVerify.title')}</DialogDescription>

                {/* `min-w-0`: grid items default to `min-width:auto`, so this column could not shrink
                    below its min-content — which the phone row sets at 332px (a `shrink-0` country
                    trigger, an `<input>` whose intrinsic size is 20 characters, and a `nowrap` action).
                    On anything narrower it overflowed, and the dialog's `left-1/2 -translate-x-1/2`
                    centring spilled it off BOTH edges: 44px at 320px wide, 4px at the very common
                    360px. Measured fixed at 320 / 360 / 375. */}
                <div className="flex h-full min-w-0 flex-col pt-safe-top">
                    <div className="flex h-[60px] shrink-0 items-center justify-end px-4">
                        <button onClick={onClose} className="-mr-1 rounded-full p-1" aria-label="close">
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    {/* `min-h-0`, same rule InviteAcceptScreen's body already states: a `flex-1` item
                        will not shrink below its content on the main axis without it, so this box
                        stayed as tall as the fields and `overflow-y-auto` never had anything to
                        scroll. That is what made a focused input unreachable behind the soft
                        keyboard — the CTA panel rides up on `--keyboard-height`, but with no scroll
                        the field above it could not follow. */}
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

                        {/* No wrapper: the banner hides itself once a social account is linked, and
                            owns its own `px-4` so this `gap-8` stack does not keep a blank slot for
                            it. */}
                        <PhoneVerifyBanner onClose={onClose} />

                        <PhoneVerifyFields state={fields} autoFocusPhone />
                    </div>

                    {/* The docked CTA panel every other form screen uses (Figma "Solid button"): the
                        shadowed white bar, plus the spacer that keeps it clear of the home indicator
                        and rides it above the keyboard. */}
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
