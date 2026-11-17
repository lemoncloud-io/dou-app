import { render, screen } from '@testing-library/react';

import { AppIconSelectSheet } from './AppIconSelectSheet';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('lucide-react', () => ({
    Check: () => <span data-testid="checked" />,
    X: () => null,
    Smartphone: () => null,
    Sparkles: () => null,
}));
jest.mock('@chatic/ui-kit', () => ({ cn: (...names: unknown[]) => names.filter(Boolean).join(' ') }));
jest.mock('@chatic/ui-kit/components/ui/sheet', () => ({
    Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: () => null,
}));

// What the app reports: the primary icon listed with a null id, the alternates by name.
const icons = [
    { id: null, label: 'Default' },
    { id: 'WhiteIcon', label: 'White' },
    { id: 'AuroraIcon', label: 'Aurora' },
];

const checkedRowText = () => screen.getByTestId('checked').closest('button')?.textContent;

describe('AppIconSelectSheet', () => {
    it('checks the default row while the app reports its stored name, DefaultIcon', () => {
        render(
            <AppIconSelectSheet
                isOpen
                onClose={jest.fn()}
                currentIcon="DefaultIcon"
                availableIcons={icons}
                onSelectIcon={jest.fn()}
            />
        );

        expect(screen.getAllByTestId('checked')).toHaveLength(1);
        expect(checkedRowText()).toBe('mypage.appIcon.default');
    });

    it('checks the alternate in use and nothing else', () => {
        render(
            <AppIconSelectSheet
                isOpen
                onClose={jest.fn()}
                currentIcon="AuroraIcon"
                availableIcons={icons}
                onSelectIcon={jest.fn()}
            />
        );

        expect(screen.getAllByTestId('checked')).toHaveLength(1);
        // The `t` mock echoes the key, which the sheet reads as untranslated and falls back to the label.
        expect(checkedRowText()).toBe('Aurora');
    });
});
