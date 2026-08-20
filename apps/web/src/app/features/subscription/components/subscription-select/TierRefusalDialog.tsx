import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { planDisplayName, type TierRefusal } from '../../lib';

interface TierRefusalDialogProps {
    /** The refusal to explain, or `null` while nothing is being explained. */
    refusal: TierRefusal | null;
    onOpenChange: (open: boolean) => void;
    /** The tier the user may pick instead, when the picker offers one (`nearestSelectablePlan`). */
    alternative?: ProductView;
    /** Picks `alternative` — the dialog mediates the tap instead of only refusing it. */
    onPickAlternative: (plan: ProductView) => void;
    isKo: boolean;
}

/**
 * Answers a tap on a tier that cannot be picked.
 *
 * The picker used to hard-disable those cards, which left a greyed row, a line of small print, and a
 * tap that did nothing — every one of the three rules (already subscribed, one step at a time, first
 * subscription starts at the entry tier) had to be inferred from that. This says the rule out loud
 * and, where there is a pickable tier nearby, selects it on confirm so the user is not left to work
 * out which card the rule actually allows.
 */
export const TierRefusalDialog = ({
    refusal,
    onOpenChange,
    alternative,
    onPickAlternative,
    isKo,
}: TierRefusalDialogProps) => {
    const { t } = useTranslation();

    if (!refusal) return null;

    const alternativeName = planDisplayName(alternative, isKo);
    const description = [
        t(`mypage.subscription.refusal.${refusal}.description`),
        alternativeName && t('mypage.subscription.refusal.pickInstead', { plan: alternativeName }),
    ]
        .filter(Boolean)
        // The dialog renders `\n` as a real break (see `AlertDialog`), so the rule and the way out
        // read as two sentences rather than one run-on paragraph.
        .join('\n');

    return (
        <AlertDialog
            open
            onOpenChange={onOpenChange}
            title={t(`mypage.subscription.refusal.${refusal}.title`)}
            description={description}
            // Nothing to offer → one full-width acknowledgement, per the design system's one-action
            // dialog. A cancel button next to "확인" would be two words for the same outcome.
            cancelLabel={alternative ? t('common.cancel') : undefined}
            confirmLabel={
                alternative && alternativeName
                    ? t('mypage.subscription.refusal.selectInstead', { plan: alternativeName })
                    : t('common.confirm')
            }
            onConfirm={() => alternative && onPickAlternative(alternative)}
        />
    );
};
