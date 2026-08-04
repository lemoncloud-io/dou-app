import { render, screen } from '@testing-library/react';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
    it('renders the given label', () => {
        render(<StatusBadge label="방장" variant="owner" />);
        expect(screen.getByText('방장')).toBeInTheDocument();
    });

    it('defaults to the owner variant when none is given', () => {
        render(<StatusBadge label="방장" />);
        expect(screen.getByText('방장').className).toContain('bg-primary');
    });

    it('renders the pending variant with a muted tone', () => {
        render(<StatusBadge label="초대 대기 중" variant="pending" />);
        expect(screen.getByText('초대 대기 중').className).toContain('bg-muted');
    });

    it('renders the expired variant with a muted tone (also used for the unsupported declined state)', () => {
        render(<StatusBadge label="초대 만료" variant="expired" />);
        expect(screen.getByText('초대 만료').className).toContain('bg-muted');
    });

    it('renders the mine variant with a dark tone', () => {
        render(<StatusBadge label="MY" variant="mine" />);
        expect(screen.getByText('MY').className).toContain('bg-foreground');
    });
});
