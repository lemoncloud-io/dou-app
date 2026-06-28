import { useTranslation } from 'react-i18next';

import { Plus } from 'lucide-react';

export const AddAccountButton = ({ onClick }: { onClick: () => void }) => {
    const { t } = useTranslation();

    return (
        <div className="px-4 pb-4 pt-10">
            <button
                onClick={onClick}
                className="flex w-full items-center justify-center gap-[6px] rounded-full border border-foreground px-6 py-3"
            >
                <span className="text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-foreground">
                    {t('cloudSessionSheet.addAccount')}
                </span>
                <Plus size={24} className="text-foreground" />
            </button>
        </div>
    );
};
