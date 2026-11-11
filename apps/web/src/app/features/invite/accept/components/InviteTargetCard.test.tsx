import { render, screen } from '@testing-library/react';

import { InviteTargetCard } from './InviteTargetCard';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            key === 'inviteAccept.target.roomFriends' ? `friends ${opts?.count}` : key,
    }),
}));

describe('InviteTargetCard', () => {
    it('draws the room name over the group caption', () => {
        render(<InviteTargetCard kind="group" name="Book club" />);

        expect(screen.getByText('Book club')).toBeTruthy();
        expect(screen.getByText('inviteAccept.target.group')).toBeTruthy();
    });

    it('draws the name over the 1:1 caption', () => {
        render(<InviteTargetCard kind="oneToOne" name="Sunny" />);

        expect(screen.getByText('Sunny')).toBeTruthy();
        expect(screen.getByText('inviteAccept.target.oneToOne')).toBeTruthy();
    });

    it.each([undefined, '', '   '])('draws the caption alone when the name is %p', name => {
        const { container } = render(<InviteTargetCard kind="group" name={name} />);

        expect(screen.getByText('inviteAccept.target.group')).toBeTruthy();
        // The caption is the only line — no "You", no empty line standing in for the name.
        expect(container.querySelectorAll('p')).toHaveLength(1);
        expect(screen.queryByText('inviteAccept.target.you')).toBeNull();
    });

    it('trims the name it draws', () => {
        render(<InviteTargetCard kind="group" name="  Book club  " />);

        expect(screen.getByText('Book club')).toBeTruthy();
    });

    it('defaults to the group caption', () => {
        render(<InviteTargetCard />);

        expect(screen.getByText('inviteAccept.target.group')).toBeTruthy();
    });

    it('shows the member badge only once a count arrives', () => {
        const { rerender } = render(<InviteTargetCard kind="group" />);
        expect(screen.queryByText(/friends/)).toBeNull();

        rerender(<InviteTargetCard kind="group" memberCount={20} />);
        expect(screen.getByText('friends 20')).toBeTruthy();
    });
});
