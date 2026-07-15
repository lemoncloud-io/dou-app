import { render, screen } from '@testing-library/react';

import { Text } from './Text';

describe('Text', () => {
    it('renders children with the variant classes', () => {
        render(<Text variant="title">제목</Text>);
        expect(screen.getByText('제목').className).toContain('text-[21px]');
    });

    it('renders the element given by `as`', () => {
        render(<Text as="h1">Heading</Text>);
        expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument();
    });
});
