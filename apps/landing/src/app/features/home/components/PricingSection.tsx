import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

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

            {/* Cards: side by side from `xl` as in the design, stacked below it */}
            <div className="flex flex-col xl:flex-row xl:items-stretch gap-[26px]">
                {/* Basic Service */}
                <div className="glass-card border border-main-green rounded-[34px] md:rounded-[42px] p-9 md:p-12 xl:flex-1 xl:flex xl:flex-col xl:justify-center animate-fade-in-up animate-delay-100 text-center">
                    <h3 className="font-semibold text-[24px] md:text-[32px] text-navy mb-6">
                        {t('pricing.basic.title')}
                    </h3>
                    <p className="text-subtitle text-base mb-6 leading-relaxed">{t('pricing.basic.description')}</p>
                    <div className="flex flex-wrap gap-3 justify-center">
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
                <div className="glass-card border border-main-green rounded-[34px] md:rounded-[42px] p-9 md:p-12 xl:flex-1 animate-fade-in-up animate-delay-200 text-center">
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
                    <ul className="text-subtitle text-sm md:text-base space-y-2 mb-6 inline-block text-left">
                        {(['detail1', 'detail2', 'detail3', 'detail4'] as const).map(key => (
                            <li key={key} className="flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 bg-subtitle rounded-full flex-shrink-0" />
                                {t(`pricing.subscription.${key}`)}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-3 justify-center xl:flex-col xl:items-start xl:flex-nowrap">
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

            {/* The way on to the plans, which are listed on every host */}
            <div className="mt-10 flex justify-center animate-fade-in-up animate-delay-300">
                <Link
                    to={ROUTES.subscription.plans}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-main-green
                               px-10 py-6 text-xl md:text-2xl font-bold tracking-[-0.6px] text-main-green backdrop-blur-md
                               transition-opacity hover:opacity-80"
                >
                    {t('header.plans')}
                    <ChevronRightIcon />
                </Link>
            </div>
        </div>
    );
};

const ChevronRightIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const StarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#B0EA10" stroke="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
);
