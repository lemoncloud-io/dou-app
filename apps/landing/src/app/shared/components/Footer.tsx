import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';

export const Footer = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <footer className="w-full bg-background border-t border-border">
            <div className="max-w-[1440px] mx-auto flex flex-col items-center py-12 sm:py-16 px-6 md:px-10">
                {/* Logo */}
                <div className="flex items-center gap-2 mb-4">
                    <img src={Logo.logo} alt="DoU" className="h-7 w-7" />
                    <span className="text-foreground text-[22px] font-bold">DoU</span>
                </div>

                {/* Contact */}
                <a
                    href="mailto:app@example.com"
                    className="text-[14px] text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                    app@example.com
                </a>

                {/* Links */}
                <div className="flex gap-6 text-[14px] text-muted-foreground mb-8">
                    <Link to="/policy/terms" className="hover:text-foreground transition-colors">
                        {t('footer.terms')}
                    </Link>
                    <Link to="/policy/privacy" className="hover:text-foreground transition-colors">
                        {t('footer.privacy')}
                    </Link>
                </div>

                {/* Copyright */}
                <p className="text-[12px] text-muted-foreground/70 text-center">{t('footer.copyright')}</p>
            </div>
        </footer>
    );
};
