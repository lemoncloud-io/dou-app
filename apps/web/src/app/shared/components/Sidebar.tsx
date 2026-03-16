import { Globe, Home, LogOut, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/page-transition';
import { toast } from 'sonner';

import { useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@chatic/ui-kit/components/ui/tooltip';
import { useLogout } from '@chatic/web-core';

import type { JSX, ReactNode } from 'react';

interface NavItem {
    path: string;
    labelKey: string;
    icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [{ path: '/', labelKey: 'nav.home', icon: <Home className="h-4 w-4" /> }];

/**
 * Sidebar navigation component
 * - Displays navigation links to main routes
 * - Highlights active route
 * - Settings controls (theme, language, logout)
 */
export const Sidebar = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { theme, setTheme } = useTheme();

    const { mutate: logout, isPending: isLoggingOut } = useLogout(
        () => {
            toast.success(t('home.logoutSuccess', 'Logged out successfully'));
            navigate('/auth/login', { replace: true });
        },
        error => {
            console.error('Logout failed:', error);
            toast.error(t('home.logoutFailed', 'Logout failed'));
        }
    );

    const isActive = (path: string): boolean => {
        if (path === '/') {
            return location.pathname === '/';
        }
        return location.pathname.startsWith(path);
    };

    const handleThemeToggle = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const handleLanguageToggle = () => {
        const newLang = i18n.language === 'en' ? 'ko' : 'en';
        i18n.changeLanguage(newLang);
    };

    const handleLogout = () => {
        logout();
    };

    return (
        <aside className="w-56 border-r bg-card flex flex-col">
            {/* Logo/Brand */}
            <div className="h-14 flex items-center px-4 border-b">
                <span className="text-lg font-semibold">Chatic</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1">
                {NAV_ITEMS.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive(item.path)
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                    >
                        {item.icon}
                        <span>{t(item.labelKey)}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Settings Footer */}
            <div className="p-3 border-t space-y-3">
                {/* Settings Buttons */}
                <TooltipProvider>
                    <div className="flex items-center justify-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleThemeToggle}>
                                    {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>{t('settings.theme')}</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleLanguageToggle}>
                                    <Globe className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>{i18n.language === 'en' ? 'English' : '한국어'}</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-destructive hover:text-destructive"
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>{t('home.logout')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>

                {/* Version */}
                <div className="text-xs text-muted-foreground text-center">
                    v{import.meta.env.VITE_APP_VERSION || '0.0.0'}
                </div>
            </div>
        </aside>
    );
};
