import { fireEvent, render, screen } from '@testing-library/react';

import { ProfileAvatar } from './ProfileAvatar';

describe('ProfileAvatar', () => {
    it('renders the image when src is provided', () => {
        render(<ProfileAvatar src="http://example.com/turtle.png" alt="프로필 사진" onSelect={jest.fn()} />);

        expect(screen.getByRole('img', { name: '프로필 사진' })).toHaveAttribute(
            'src',
            'http://example.com/turtle.png'
        );
    });

    it('renders a placeholder glyph (no image) when src is absent', () => {
        render(<ProfileAvatar onSelect={jest.fn()} />);

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('fires onSelect and renders as a button when onSelect is provided', () => {
        const onSelect = jest.fn();
        render(<ProfileAvatar onSelect={onSelect} selectLabel="사진 선택" />);

        fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));

        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('is not a button when onSelect is omitted', () => {
        render(<ProfileAvatar src="http://example.com/turtle.png" alt="프로필" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
