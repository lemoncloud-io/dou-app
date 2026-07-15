import { render, screen } from '@testing-library/react';

import { AvatarGroup } from './AvatarGroup';

const avatar = (key: string) => <span data-testid={key} key={key} className="size-6 rounded-full" />;

describe('AvatarGroup', () => {
    it('renders the given avatars and the total count', () => {
        render(<AvatarGroup avatars={[avatar('a'), avatar('b')]} count={2} />);

        expect(screen.getByTestId('a')).toBeTruthy();
        expect(screen.getByTestId('b')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
    });

    it('caps the rendered avatars at `max` but shows the real total', () => {
        const avatars = ['a', 'b', 'c', 'd', 'e', 'f'].map(avatar);
        render(<AvatarGroup avatars={avatars} count={22} max={4} />);

        expect(screen.getByTestId('d')).toBeTruthy();
        expect(screen.queryByTestId('e')).toBeNull();
        expect(screen.getByText('22')).toBeTruthy();
    });

    it('renders just the count when there are no avatars (group with only me)', () => {
        const { container } = render(<AvatarGroup avatars={[]} count={1} />);

        expect(screen.getByText('1')).toBeTruthy();
        expect(container.querySelector('span.-ml-1\\.5')).toBeNull();
    });

    it('defaults the count to the number of avatars', () => {
        render(<AvatarGroup avatars={[avatar('a'), avatar('b'), avatar('c')]} />);

        expect(screen.getByText('3')).toBeTruthy();
    });
});
