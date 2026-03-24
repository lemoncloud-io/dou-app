import { useTranslation } from 'react-i18next';

export const PricingSection = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <div className="mt-16 md:mt-32 xl:mt-[132px]">
            {/* Title */}
            <h2
                className="font-heading font-bold text-white text-center
                           text-[32px] md:text-[52px] xl:text-[64px]
                           tracking-[-0.8px] md:tracking-[-1.3px] xl:tracking-[-1.6px]
                           leading-[1.1] mb-10 md:mb-[54px]
                           animate-fade-in-up"
            >
                {t('pricing.title')}
            </h2>

            {/* Cards */}
            <div className="flex flex-col md:flex-row gap-[26px] px-0 md:px-4 xl:px-[86px]">
                {/* Basic Service */}
                <div className="flex-1 glass-card border border-main-green rounded-[34px] md:rounded-[42px] p-9 md:p-12 xl:p-[48px_68px] animate-fade-in-up animate-delay-100">
                    <h3 className="font-semibold text-[24px] md:text-[32px] text-navy mb-6">
                        {t('pricing.basic.title')}
                    </h3>
                    <p className="text-subtitle text-base mb-6 leading-relaxed">{t('pricing.basic.description')}</p>
                    <div className="flex flex-wrap gap-3">
                        {(['feature1', 'feature2'] as const).map(key => (
                            <span
                                key={key}
                                className="inline-flex items-center gap-2 text-desc-alt text-sm md:text-base"
                            >
                                <StarIcon />
                                {t(`pricing.basic.${key}`)}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Subscription Service */}
                <div className="flex-1 glass-card border border-main-green rounded-[34px] md:rounded-[42px] p-9 md:p-12 animate-fade-in-up animate-delay-200">
                    <h3 className="font-semibold text-[24px] md:text-[32px] text-navy mb-4">
                        {t('pricing.subscription.title')}
                    </h3>
                    <p className="text-navy mb-1">
                        <span className="font-bold text-[32px] md:text-[40px]">
                            {t('pricing.subscription.highlight')}
                        </span>{' '}
                        <span className="font-bold text-[40px] md:text-[48px] text-main-green">
                            {t('pricing.subscription.price')}
                        </span>
                    </p>
                    <ul className="text-subtitle text-sm md:text-base space-y-2 mb-6">
                        {(['detail1', 'detail2', 'detail3', 'detail4'] as const).map(key => (
                            <li key={key} className="flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 bg-subtitle rounded-full flex-shrink-0" />
                                {t(`pricing.subscription.${key}`)}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                        {(['feature1', 'feature2', 'feature3', 'feature4', 'feature5'] as const).map(key => (
                            <span
                                key={key}
                                className="inline-flex items-center gap-2 text-desc-alt text-sm md:text-base"
                            >
                                <StarIcon />
                                {t(`pricing.subscription.${key}`)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#B0EA10" stroke="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
);
