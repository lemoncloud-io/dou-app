import { useTranslation } from 'react-i18next';

export const EmptyState = () => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-1 items-center justify-center px-4 py-[10px]">
            <p className="text-center text-[16px] leading-[1.45] tracking-[-0.01em] text-[#84888F]">
                {t('search.noResults')}
            </p>
        </div>
    );
};
