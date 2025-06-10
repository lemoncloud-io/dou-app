import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Moon, Settings, Sun } from 'lucide-react';

import { useTheme } from '@lemon/theme';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';

interface SettingsControlProps {
    className?: string;
}

export const SettingsControl = ({ className = '' }: SettingsControlProps) => {
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language || 'en');
    const [buttonPosition, setButtonPosition] = useState({ top: 0, right: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setCurrentLanguage(i18n.language);
    }, [i18n.language]);

    // 버튼 위치 계산
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setButtonPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen]);

    const handleThemeToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    };

    const handleLanguageToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newLanguage = currentLanguage === 'en' ? 'ko' : 'en';
        setCurrentLanguage(newLanguage);
        i18n.changeLanguage(newLanguage);
    };

    const handleSettingsClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const closePanel = () => {
        setIsOpen(false);
    };

    // 드롭다운 패널을 포털로 렌더링
    const DropdownPanel = () => {
        if (!isOpen) return null;

        return createPortal(
            <>
                {/* Backdrop */}
                <div
                    className="fixed inset-0 bg-transparent"
                    style={{
                        zIndex: 999,
                        pointerEvents: 'auto',
                    }}
                    onClick={closePanel}
                />

                {/* Settings Panel */}
                <Card
                    className="fixed border-0 p-4 space-y-3"
                    style={{
                        top: `${buttonPosition.top}px`,
                        right: `${buttonPosition.right}px`,
                        width: '192px',
                        zIndex: 1000,
                        backgroundColor: 'hsl(var(--background) / 0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid hsl(var(--border) / 0.2)',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground/80 font-medium">{t('settings.theme', 'Theme')}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleThemeToggle}
                            className="h-8 w-8 p-0 hover:bg-primary/10 rounded-md"
                            style={{ pointerEvents: 'auto' }}
                        >
                            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Language Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground/80 font-medium">
                            {t('settings.language', 'Language')}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLanguageToggle}
                            className="h-8 px-2 text-xs hover:bg-primary/10 rounded-md font-medium"
                            style={{ pointerEvents: 'auto' }}
                        >
                            {currentLanguage === 'en' ? '한글' : 'EN'}
                        </Button>
                    </div>
                </Card>
            </>,
            document.body
        );
    };

    return (
        <div className={`relative ${className}`}>
            {/* Settings Button */}
            <Button
                ref={buttonRef}
                variant="ghost"
                size="sm"
                onClick={handleSettingsClick}
                className="text-foreground/70 hover:text-foreground hover:bg-foreground/10"
                style={{
                    zIndex: 30,
                    pointerEvents: 'auto',
                    position: 'relative',
                }}
            >
                <Settings className="w-5 h-5" />
            </Button>

            <DropdownPanel />
        </div>
    );
};
