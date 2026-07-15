import { render, screen } from '@testing-library/react';

import { BenefitItem } from '@chatic/web-ui-kit';
import { PlanBadge } from '@chatic/web-ui-kit';

describe('PlanBadge', () => {
    it('renders the tier label', () => {
        render(<PlanBadge label="PRO" />);

        expect(screen.getByText('PRO')).toBeInTheDocument();
    });

    it('renders a custom icon when provided', () => {
        render(<PlanBadge label="FREE" icon={<span>star</span>} />);

        expect(screen.getByText('star')).toBeInTheDocument();
    });
});

describe('BenefitItem', () => {
    it('renders icon, title and description', () => {
        render(<BenefitItem icon={<span>ic</span>} title="title 가나다" description="text text" />);

        expect(screen.getByText('ic')).toBeInTheDocument();
        expect(screen.getByText('title 가나다')).toBeInTheDocument();
        expect(screen.getByText('text text')).toBeInTheDocument();
    });
});
