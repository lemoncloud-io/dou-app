import { useTranslation } from 'react-i18next';

import { IconPlus, SubscriptionBadge } from '@chatic/web-ui-kit';

/**
 * "＋ 클라우드 추가" pill. Lives in the switcher's "내 클라우드" section FOOTER, so it stays visible
 * while that section is collapsed, and it is shown regardless of how many clouds are owned — the
 * 1-cloud cap is enforced by the handler with a toast, not by hiding the button (ADR-0034).
 *
 * The trailing PRO pill (Figma 3769:34789) is a static "adding a cloud is a PRO feature" marker, not
 * a readout of the viewer's membership — hence a fixed `tier`, and `SubscriptionBadge` rather than
 * `SubscriptionButton`, which would nest a `<button>` inside this one.
 *
 * Spacing is Figma 3486:25675 / 3769:34781: a 16px pad on all four sides of the footer slot, and a
 * 343×54 pill (px 25 / py 11). The 54 falls out of the padding rather than being pinned — the PRO
 * badge is the tallest child at the button system's 32px `sm` size, so 11 + 32 + 11 lands on spec.
 */
export const AddAccountButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();

    return (
        <div className="p-4">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-input-border px-[25px] py-[11px]"
            >
                <IconPlus className="size-6 text-foreground" />
                <span className="text-[16px] font-semibold leading-[1.375] tracking-[-0.005em] text-foreground">
                    {t('cloudSessionSheet.addAccount')}
                </span>
                <SubscriptionBadge tier="pro" />
            </button>
        </div>
    );
};
