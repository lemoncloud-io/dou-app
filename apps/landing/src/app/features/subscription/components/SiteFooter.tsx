import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { COMPANY } from '../../../config/links';
import { ROUTES } from '../../../routes/paths';

const LINK = 'whitespace-nowrap underline underline-offset-2 hover:text-navy transition-colors';

/**
 * The pale footer under the subscription pages: who sells, and the three policy links. On a phone the
 * links come first, above the details; from `md` the details sit left with the copyright line and the
 * links level with it on the right. The home page keeps its own green footer.
 */
export const SiteFooter = (): JSX.Element => {
    const { t } = useTranslation();

    const links = (
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-desc-alt md:gap-x-8 md:text-base">
            <Link to={ROUTES.policy.terms} className={LINK}>
                {t('footer.terms')}
            </Link>
            <Link to={ROUTES.policy.privacy} className={LINK}>
                {t('footer.privacy')}
            </Link>
            <Link to={ROUTES.policy.child} className={LINK}>
                {t('footer.child')}
            </Link>
            {/* The design's header drops the policy entry; the refund policy must stay one click away. */}
            <Link to={ROUTES.policy.refund} className={LINK}>
                {t('subscription.common.nav.policy')}
            </Link>
        </nav>
    );

    return (
        <footer className="w-full bg-surface">
            <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 pb-12 pt-8 md:gap-6 md:px-0 md:pb-[102px] md:pt-16">
                <Link to={ROUTES.root} className="flex w-fit items-center gap-1 hover:opacity-80">
                    <img src={Logo.logo} alt="DoU" className="h-10 w-[42px] md:h-[55px] md:w-[58px]" />
                    <img src={Logo.douBk} alt="D.U" className="h-[18px] md:h-6" />
                </Link>
                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <div className="order-2 flex flex-col gap-1.5 text-xs text-desc-alt md:order-none md:gap-4 md:pl-2 md:text-base">
                        <p>{t('footer.company.name')}</p>
                        <p>{t('footer.company.ceo')}</p>
                        <p>{t('footer.company.address')}</p>
                        <p>{t('footer.company.registration', { number: COMPANY.registrationNumber })}</p>
                        <p>{t('footer.company.tel', { number: COMPANY.tel })}</p>
                        <p>
                            {t('footer.company.mail')}{' '}
                            <a href={`mailto:${COMPANY.email}`} className="hover:text-navy transition-colors">
                                {COMPANY.email}
                            </a>
                        </p>
                        <p>{t('footer.copyright')}</p>
                    </div>
                    {links}
                </div>
            </div>
        </footer>
    );
};
