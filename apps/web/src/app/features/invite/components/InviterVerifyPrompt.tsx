import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/web-ui-kit';

interface InviterVerifyPromptProps {
    /** Opens the verification sheet. */
    onStart: () => void;
}

/**
 * What a guest sees instead of the invite form (Figma 3578-67319). Relay invites can only be issued
 * by a main user, so the DM entry point intercepts a device user here rather than letting them fill
 * the form and hit a 403 on submit (ADR-0034 결정 1).
 *
 * The CTA sits directly under the copy rather than pinned to the bottom — that is the design's own
 * placement (`y=168` of a 812-tall frame), not the house convention for full-screen forms.
 */
export const InviterVerifyPrompt = ({ onStart }: InviterVerifyPromptProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-8 pt-6">
            <div className="flex flex-col gap-4 px-4">
                <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                    {t('contactInvite.verifyPrompt.title')}
                </h2>
                <p className="whitespace-pre-line text-center text-[14px] font-medium leading-[20px] text-description">
                    {t('contactInvite.verifyPrompt.note')}
                </p>
            </div>

            <div className="px-4">
                <Button tone="green" size="lg" fullWidth onClick={onStart}>
                    {t('contactInvite.verifyPrompt.cta')}
                </Button>
            </div>
        </div>
    );
};
