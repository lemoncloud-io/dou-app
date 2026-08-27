import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));

import { CountrySelect } from './CountrySelect';

describe('CountrySelect', () => {
    it('shows the dial code of the current country', () => {
        render(<CountrySelect value="KR" onChange={jest.fn()} />);

        expect(screen.getByText('+82')).toBeInTheDocument();
    });

    it('shows a placeholder — not an error — when no country is set', () => {
        render(<CountrySelect value={null} onChange={jest.fn()} />);

        expect(screen.getByText('phoneInput.countryPlaceholder')).toBeInTheDocument();
    });

    it('opens the sheet and reports the pick', () => {
        const onChange = jest.fn();
        render(<CountrySelect value="KR" onChange={onChange} />);

        fireEvent.click(screen.getByLabelText('phoneInput.countrySheetTitle'));
        fireEvent.click(screen.getByText('일본'));

        expect(onChange).toHaveBeenCalledWith('JP');
        // The sheet closed with the pick, so its search box is gone.
        expect(screen.queryByPlaceholderText('phoneInput.countrySearchPlaceholder')).not.toBeInTheDocument();
    });
});
