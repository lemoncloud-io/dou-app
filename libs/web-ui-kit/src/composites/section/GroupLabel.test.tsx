import { render, screen } from '@testing-library/react';

import { GroupLabel } from '@chatic/web-ui-kit';

describe('GroupLabel', () => {
    it('renders the label text', () => {
        render(<GroupLabel label="대화방 설정" />);
        expect(screen.getByText('대화방 설정')).toBeInTheDocument();
    });

    it('merges a passed className', () => {
        render(<GroupLabel label="방 친구" className="mt-2" />);
        expect(screen.getByText('방 친구')).toHaveClass('mt-2');
    });
});
