import { render, screen } from '@testing-library/react';

import { Divider } from '@chatic/web-ui-kit';

describe('Divider', () => {
    it('renders a separator role', () => {
        render(<Divider />);
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('uses the thin hairline height by default', () => {
        render(<Divider />);
        expect(screen.getByRole('separator')).toHaveClass('h-px');
    });

    it('uses the thick block treatment for variant="block"', () => {
        render(<Divider variant="block" />);
        expect(screen.getByRole('separator')).toHaveClass('h-1');
    });

    it('merges a passed className', () => {
        render(<Divider className="my-4" />);
        expect(screen.getByRole('separator')).toHaveClass('my-4');
    });
});
