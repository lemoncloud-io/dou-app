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
                    className="fixed border border-chatic-neutral-200 p-chatic-md space-y-3 bg-white/95 backdrop-blur-md rounded-chatic-sm shadow-lg"
                    style={{
                        top: `${buttonPosition.top}px`,
                        right: `${buttonPosition.right}px`,
                        width: '192px',
                        zIndex: 1000,
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-chatic-sm text-chatic-text-primary font-chatic font-medium">
                            {t('settings.theme', '테마')}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleThemeToggle}
                            className="h-8 w-8 p-0 hover:bg-chatic-neutral-50 rounded-chatic-xs text-chatic-text-primary"
                            style={{ pointerEvents: 'auto' }}
                        >
                            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Language Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-chatic-sm text-chatic-text-primary font-chatic font-medium">
                            {t('settings.language', '언어')}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLanguageToggle}
                            className="h-8 px-2 text-chatic-xs hover:bg-chatic-neutral-50 rounded-chatic-xs font-chatic font-medium text-chatic-text-primary"
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
                className="text-chatic-text-secondary hover:text-chatic-text-primary hover:bg-chatic-neutral-50 rounded-chatic-xs"
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
