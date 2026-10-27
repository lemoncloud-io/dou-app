import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';

import { COMPANY } from '../../../config/links';
import { ROUTES } from '../../../routes/paths';

const LINK = 'whitespace-nowrap underline hover:text-navy transition-colors';

/**
 * The company's business details on the left, ending in the copyright line, and the three policy
 * links on the right, level with that last line. A site that sells a subscription shows who sells it,
 * so these details are on every visit, not only on the subscription pages.
 */
export const Footer = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <footer className="w-full bg-main-green">
            <div className="box-content max-w-[1440px] mx-auto flex flex-col gap-6 px-6 md:px-10 pt-16 pb-24">
                <Link to={ROUTES.root} className="flex w-fit items-center gap-1.5 hover:opacity-80 transition-opacity">
                    <img src={Logo.logo} alt="DoU" className="h-[55px] w-[58px]" />
                    <img src={Logo.douBk} alt="D.U" className="h-6" />
                </Link>

                <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-4 text-base text-desc-alt">
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

                    <nav className="flex shrink-0 flex-col gap-3 text-base text-desc-alt md:flex-row md:gap-8">
                        <Link to={ROUTES.policy.terms} className={LINK}>
                            {t('footer.terms')}
                        </Link>
                        <Link to={ROUTES.policy.privacy} className={LINK}>
                            {t('footer.privacy')}
                        </Link>
                        <Link to={ROUTES.policy.child} className={LINK}>
                            {t('footer.child')}
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
};
