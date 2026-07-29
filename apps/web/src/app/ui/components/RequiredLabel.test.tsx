import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { RequiredLabel } from './RequiredLabel';

describe('RequiredLabel', () => {
    it('renders the label text with a decorative asterisk', () => {
        const { container } = render(<RequiredLabel>제목</RequiredLabel>);

        expect(screen.getByText('제목')).toBeInTheDocument();
        const asterisk = container.querySelector('.text-destructive');
        expect(asterisk).toHaveTextContent('*');
        // Decorative only — the requirement is conveyed by the input's own required/aria-required.
        expect(asterisk).toHaveAttribute('aria-hidden');
    });

    it('forwards label props through to the kit label', () => {
        render(
            <>
                <RequiredLabel htmlFor="field" className="custom">
                    이름
                </RequiredLabel>
                <input id="field" />
            </>
        );

        const label = screen.getByText('이름').closest('label');
        expect(label).toHaveAttribute('for', 'field');
        expect(label).toHaveClass('custom');
    });
});
