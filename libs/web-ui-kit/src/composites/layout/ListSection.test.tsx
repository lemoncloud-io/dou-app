import { render, screen } from '@testing-library/react';

import { ListSection } from './ListSection';

describe('ListSection', () => {
    it('renders the title, actions and rows', () => {
        render(
            <ListSection title="Place" actions={<button>add</button>}>
                <div>row 1</div>
                <div>row 2</div>
            </ListSection>
        );

        expect(screen.getByText('Place')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'add' })).toBeInTheDocument();
        expect(screen.getByText('row 1')).toBeInTheDocument();
        expect(screen.getByText('row 2')).toBeInTheDocument();
    });

    it('renders the accent count', () => {
        render(
            <ListSection title="Chat" count={4}>
                <div>row</div>
            </ListSection>
        );
        expect(screen.getByText('4')).toBeInTheDocument();
    });
});
