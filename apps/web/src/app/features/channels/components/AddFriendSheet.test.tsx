import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = jest.fn();
const requestLink = jest.fn();
const onLinkReady = jest.fn();
const onOpenChange = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/ui-kit/components/ui/sheet', () => ({
    Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    SheetContent: ({ children }: any) => <div>{children}</div>,
}));

import { AddFriendSheet } from './AddFriendSheet';

const fill = () => {
    fireEvent.change(screen.getByPlaceholderText('addFriend.namePlaceholder'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByPlaceholderText('addFriend.phonePlaceholder'), {
        target: { value: '010-1234-5678' },
    });
};

describe('AddFriendSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        requestLink.mockResolvedValue('https://dou.chatic.io/s?code=abc');
    });

    it('asks the host for a link, closes, then hands the link back', async () => {
        render(<AddFriendSheet open onOpenChange={onOpenChange} requestLink={requestLink} onLinkReady={onLinkReady} />);
        fill();
        fireEvent.click(screen.getByText('addFriend.share'));

        await waitFor(() => expect(requestLink).toHaveBeenCalledWith({ name: '홍길동', phone: '01012345678' }));
        await waitFor(() => expect(onLinkReady).toHaveBeenCalledWith('https://dou.chatic.io/s?code=abc'));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open and says why when issuing fails', async () => {
        requestLink.mockRejectedValue(new Error('placeInvite.placeChanged'));
        render(<AddFriendSheet open onOpenChange={onOpenChange} requestLink={requestLink} onLinkReady={onLinkReady} />);
        fill();
        fireEvent.click(screen.getByText('addFriend.share'));

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'placeInvite.placeChanged', variant: 'destructive' })
        );
        expect(onLinkReady).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('keeps the button disabled while the host has nothing to invite into', () => {
        render(<AddFriendSheet open onOpenChange={onOpenChange} onLinkReady={onLinkReady} />);
        fill();

        expect(screen.getByText('addFriend.share').closest('button')).toBeDisabled();
    });
});
