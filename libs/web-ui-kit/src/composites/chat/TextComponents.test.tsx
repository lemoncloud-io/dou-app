import { render, screen } from '@testing-library/react';

import { DateDivider } from '@chatic/web-ui-kit';

describe('DateDivider', () => {
    it('renders the label', () => {
        render(<DateDivider label="2025년 00월 00일 월요일" />);

        expect(screen.getByText('2025년 00월 00일 월요일')).toBeInTheDocument();
    });
});

// SystemMessage now has its own colocated suite (SystemMessage.test.tsx), per the pattern the rest
// of this folder follows.
