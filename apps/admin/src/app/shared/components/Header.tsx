import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AlignLeft, EllipsisVertical, Languages, Moon, Sun } from 'lucide-react';

import { useTheme } from '@lemon/theme';
import { Button } from '@lemon/ui-kit/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@lemon/ui-kit/components/ui/dropdown-menu';

import { useLayoutStore } from '../stores/useLayoutStore';

export const Header = () => {
    const navigate = useNavigate();
    const { i18n, t } = useTranslation();

    const toggleSidebar = useLayoutStore(state => state.toggleSidebar);
    const { setTheme, isDarkTheme } = useTheme();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleLogout = () => {
        navigate('/auth/logout');
    };

    const toggleLanguage = () => {
        const nextLang = i18n.language === 'ko' ? 'en' : 'ko';
        i18n.changeLanguage(nextLang);
    };

    const handleMenuClick = (action: () => void) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        action();
    };

    return (
        <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-full items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                        <AlignLeft className="h-5 w-5" />
                    </Button>
                    <span className="text-2xl font-bold gradient-text">Lemon Admin</span>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <EllipsisVertical className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleMenuClick(() => navigate('/profile'))}>
                                {t('menu.profile')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleMenuClick(() => navigate('/settings'))}>
                                {t('menu.settings')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleMenuClick(toggleLanguage)}>
                                <Languages className="mr-2 h-4 w-4" />
                                {i18n.language === 'ko' ? 'English' : '한국어'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleMenuClick(() => setTheme(isDarkTheme ? 'light' : 'dark'))}>
                                {isDarkTheme ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                                {isDarkTheme ? 'Light Mode' : 'Dark Mode'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleMenuClick(handleLogout)}>
                                {t('oauth.signout')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
};
