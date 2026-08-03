import { useTranslation } from 'react-i18next';

import { IconPlus } from '@chatic/web-ui-kit';

/**
 * "＋ 클라우드 추가" pill. Lives in the switcher's "내 클라우드" section FOOTER, so it stays visible
 * while that section is collapsed, and it is shown regardless of how many clouds are owned — the
 * 1-cloud cap is enforced by the handler with a toast, not by hiding the button (ADR-0034).
 */
export const AddAccountButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();

    return (
        <div className="px-4 pb-2 pt-3">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-center gap-[6px] rounded-full border border-input-border px-6 py-3"
            >
                <IconPlus className="size-6 text-foreground" />
                <span className="text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-foreground">
                    {t('cloudSessionSheet.addAccount')}
                </span>
            </button>
        </div>
    );
};
