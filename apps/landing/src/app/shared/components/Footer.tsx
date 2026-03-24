import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';

export const Footer = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <footer className="w-full bg-main-green">
            <div
                className="mx-auto flex flex-col md:flex-row md:items-center md:justify-between
                            px-4 md:px-[62px] xl:px-[240px] py-12 md:py-16 gap-[18px]"
            >
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <img src={Logo.logo} alt="DoU" className="h-[55px] w-[58px] object-contain" />
                    <span className="text-navy text-[22px] font-bold">D.U</span>
                </Link>

                {/* Right side */}
                <div className="flex flex-col gap-7 md:gap-3 md:items-end">
                    {/* Nav links */}
                    <div className="flex flex-col md:flex-row gap-3 md:gap-8 text-base text-desc-alt">
                        <Link to="/policy/terms" className="underline hover:text-navy transition-colors">
                            {t('footer.terms')}
                        </Link>
                        <Link to="/policy/privacy" className="underline hover:text-navy transition-colors">
                            {t('footer.privacy')}
                        </Link>
                        <Link to="/policy/child" className="underline hover:text-navy transition-colors">
                            {t('footer.child')}
                        </Link>
                    </div>

                    {/* Info */}
                    <div className="flex flex-col md:flex-row gap-3 md:gap-8 text-base text-desc-alt">
                        <a href="mailto:app@lemoncloud.io" className="hover:text-navy transition-colors">
                            app@lemoncloud.io
                        </a>
                        <span>{t('footer.copyright')}</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};
