import { render, screen } from '@testing-library/react';

import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
    it('renders the title', () => {
        render(<SectionHeader title="Place" />);

        expect(screen.getByText('Place')).toBeInTheDocument();
    });

    it('renders the count when provided (including 0)', () => {
        render(<SectionHeader title="Chat" count={0} />);

        expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders right-aligned actions', () => {
        render(<SectionHeader title="Chat" actions={<button>add</button>} />);

        expect(screen.getByRole('button', { name: 'add' })).toBeInTheDocument();
    });
});
