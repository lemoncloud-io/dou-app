import { render } from '@testing-library/react';

import { ChatAvatar } from './ChatAvatar';

describe('ChatAvatar', () => {
    it('renders a bubble glyph and sizes by step', () => {
        const { container } = render(<ChatAvatar size="lg" />);
        const root = container.firstElementChild as HTMLElement;
        expect(root.style.width).toBe('56px');
        expect(root.querySelector('svg')).toBeTruthy();
    });
});
