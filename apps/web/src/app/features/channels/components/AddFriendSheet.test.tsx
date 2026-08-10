import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const requestInviteLink = jest.fn().mockResolvedValue('https://dou.chatic.io/s?code=abc');

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/web-core', () => ({ reportError: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/ui-kit/components/ui/sheet', () => ({
    Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    SheetContent: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../hooks', () => ({
    useCreateInviteBatch: () => ({ requestInviteLink, isPending: false }),
}));

import { AddFriendSheet } from './AddFriendSheet';

describe('AddFriendSheet', () => {
    beforeEach(() => jest.clearAllMocks());

    it('requests an invite link and navigates to the invite-link page with it in state', async () => {
        render(<AddFriendSheet open onOpenChange={jest.fn()} channelId="ch1" />);

        fireEvent.change(screen.getByPlaceholderText('addFriend.namePlaceholder'), { target: { value: '홍길동' } });
        fireEvent.change(screen.getByPlaceholderText('addFriend.phonePlaceholder'), {
            target: { value: '010-1234-5678' },
        });

        fireEvent.click(screen.getByText('addFriend.share'));

        await waitFor(() =>
            expect(requestInviteLink).toHaveBeenCalledWith({
                channelId: 'ch1',
                name: '홍길동',
                phone: '01012345678',
            })
        );
        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/channels/ch1/invite/link', {
                state: { inviteLink: 'https://dou.chatic.io/s?code=abc', roomDistance: 2 },
            })
        );
    });
});
