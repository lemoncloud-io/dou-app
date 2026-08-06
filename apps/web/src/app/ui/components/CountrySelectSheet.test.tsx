import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));

// Concrete file, not the `ui/components` barrel: the barrel reaches libs/shared and web-core, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { CountrySelectSheet } from './CountrySelectSheet';

const renderSheet = (value: string | null = 'KR') => {
    const onSelect = jest.fn();
    const onOpenChange = jest.fn();
    render(<CountrySelectSheet open value={value} onSelect={onSelect} onOpenChange={onOpenChange} />);
    return { onSelect, onOpenChange };
};

const search = (value: string) => {
    fireEvent.change(screen.getByPlaceholderText('phoneInput.countrySearchPlaceholder'), { target: { value } });
};

describe('CountrySelectSheet', () => {
    it('lists every country the metadata knows, localized and with its dial code', () => {
        renderSheet();

        expect(screen.getByText('대한민국')).toBeInTheDocument();
        expect(screen.getByText('일본')).toBeInTheDocument();
        expect(screen.getAllByText('+82').length).toBeGreaterThan(0);
        // 245 rows, no virtualization — this asserts the whole list really is in the DOM.
        expect(screen.getAllByRole('button').length).toBeGreaterThan(200);
    });

    it('filters by localized name', () => {
        renderSheet();
        search('일본');

        expect(screen.getByText('일본')).toBeInTheDocument();
        expect(screen.queryByText('대한민국')).not.toBeInTheDocument();
    });

    it('filters by dial code, with or without the +', () => {
        renderSheet();

        search('+81');
        expect(screen.getByText('일본')).toBeInTheDocument();
        expect(screen.queryByText('대한민국')).not.toBeInTheDocument();

        search('82');
        expect(screen.getByText('대한민국')).toBeInTheDocument();
    });

    it('filters by ISO code so a Latin query works against Korean names', () => {
        renderSheet();
        search('jp');

        expect(screen.getByText('일본')).toBeInTheDocument();
    });

    it('says so when nothing matches', () => {
        renderSheet();
        search('zzzzz');

        expect(screen.getByText('phoneInput.noResults')).toBeInTheDocument();
    });

    it('reports the pick and closes', () => {
        const { onSelect, onOpenChange } = renderSheet();
        search('일본');

        fireEvent.click(screen.getByText('일본'));

        expect(onSelect).toHaveBeenCalledWith('JP');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
