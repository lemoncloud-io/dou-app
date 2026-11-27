import { fireEvent, render, screen } from '@testing-library/react';

import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
    it('renders the placeholder and emits the raw string on change', () => {
        const onChange = jest.fn();
        render(<SearchInput value="" onChange={onChange} placeholder="검색" />);

        const input = screen.getByPlaceholderText('검색');
        fireEvent.change(input, { target: { value: 'sun' } });

        expect(onChange).toHaveBeenCalledWith('sun');
    });

    it('renders the trailing slot when provided', () => {
        render(<SearchInput value="" onChange={jest.fn()} trailing={<button>link</button>} />);

        expect(screen.getByRole('button', { name: 'link' })).toBeInTheDocument();
    });
});
