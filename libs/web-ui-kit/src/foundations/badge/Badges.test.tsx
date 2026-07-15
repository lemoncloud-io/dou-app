import { render, screen } from '@testing-library/react';

import { StatusBadge } from '@chatic/web-ui-kit';
import { UnreadBadge } from '@chatic/web-ui-kit';

describe('UnreadBadge', () => {
    it('renders the count', () => {
        render(<UnreadBadge count={3} />);
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('clamps to +max', () => {
        render(<UnreadBadge count={1200} max={999} />);
        expect(screen.getByText('+999')).toBeInTheDocument();
    });

    it('renders nothing at zero', () => {
        const { container } = render(<UnreadBadge count={0} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('StatusBadge', () => {
    it('renders the label', () => {
        render(<StatusBadge label="방장" variant="owner" />);
        expect(screen.getByText('방장')).toBeInTheDocument();
    });

    it('applies the pending variant color', () => {
        render(<StatusBadge label="초대 대기 중" variant="pending" />);
        expect(screen.getByText('초대 대기 중').className).toContain('bg-muted');
    });
});
