import { fireEvent, render, screen } from '@testing-library/react';

import { LanguageSelectSheet } from './LanguageSelectSheet';

const mockHaptic = jest.fn();
const setPreference = jest.fn();
const onClose = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('lucide-react', () => ({ Check: () => null, X: () => null }));
jest.mock('@chatic/ui-kit', () => ({ cn: (...names: unknown[]) => names.filter(Boolean).join(' ') }));
jest.mock('@chatic/ui-kit/components/ui/sheet', () => ({
    Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: () => null,
}));
jest.mock('../hooks/useLanguagePreference', () => ({
    useLanguagePreference: () => ({ preference: 'ko', setPreference }),
}));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

beforeEach(() => jest.clearAllMocks());

describe('LanguageSelectSheet', () => {
    it('ticks when the pick changes the language, then closes', () => {
        render(<LanguageSelectSheet isOpen onClose={onClose} />);
        fireEvent.click(screen.getByText('English'));

        expect(setPreference).toHaveBeenCalledWith('en');
        expect(onClose).toHaveBeenCalled();
        expect(mockHaptic.mock.calls).toEqual([['selection']]);
    });

    it('closes without a tick when the language already in use is picked', () => {
        render(<LanguageSelectSheet isOpen onClose={onClose} />);
        fireEvent.click(screen.getByText('한국어'));

        expect(onClose).toHaveBeenCalled();
        expect(mockHaptic).not.toHaveBeenCalled();
    });
});
