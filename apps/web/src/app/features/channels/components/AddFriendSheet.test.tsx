import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = jest.fn();
const requestLink = jest.fn();
const onLinkReady = jest.fn();
const onOpenChange = jest.fn();

// `language` because the real country picker localizes its rows with it.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
// The country picker's `BottomSheet` is built on the same primitives, so it reads the title and
// description too.
jest.mock('@chatic/ui-kit/components/ui/sheet', () => ({
    Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    SheetContent: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <div>{children}</div>,
    SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

import { AddFriendSheet } from './AddFriendSheet';

const COUNTRY_STORAGE_KEY = 'dou.phoneInput.country.v1';

const fill = (phone = '010-1234-5678') => {
    fireEvent.change(screen.getByPlaceholderText('addFriend.namePlaceholder'), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByPlaceholderText('addFriend.phonePlaceholder'), { target: { value: phone } });
};

/** jsdom fixes `navigator.language` at `en-US`; the default-country cases need to move it. */
const setLanguage = (value: string) => {
    Object.defineProperty(window.navigator, 'language', { value, configurable: true });
};

const renderSheet = () =>
    render(<AddFriendSheet open onOpenChange={onOpenChange} requestLink={requestLink} onLinkReady={onLinkReady} />);

const share = () => fireEvent.click(screen.getByText('addFriend.share'));

describe('AddFriendSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        requestLink.mockResolvedValue('https://dou.chatic.io/s?code=abc');
        // Korea as the remembered pick — the production "last explicit pick wins" path, rather than
        // stubbing around jsdom's `en-US`.
        localStorage.clear();
        localStorage.setItem(COUNTRY_STORAGE_KEY, 'KR');
    });

    afterEach(() => setLanguage('en-US'));

    it('asks the host for a link, closes, then hands the link back', async () => {
        renderSheet();
        fill();
        share();

        await waitFor(() => expect(requestLink).toHaveBeenCalledWith({ name: '홍길동', phone: '+821012345678' }));
        await waitFor(() => expect(onLinkReady).toHaveBeenCalledWith('https://dou.chatic.io/s?code=abc'));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open and says why when issuing fails', async () => {
        requestLink.mockRejectedValue(new Error('placeInvite.placeChanged'));
        renderSheet();
        fill();
        share();

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

    describe('international numbers', () => {
        it.each([
            ['010-1234-5678', '+821012345678'],
            ['+82 10-1234-5678', '+821012345678'],
            ['+1 415 555 0123', '+14155550123'],
            ['\u202D010-1234-5678\u202C', '+821012345678'],
            ['010-123-4567', '+82101234567'],
        ])('sends %s as %s', async (typed, e164) => {
            renderSheet();
            fill(typed);
            share();

            await waitFor(() => expect(requestLink).toHaveBeenCalledWith({ name: '홍길동', phone: e164 }));
        });

        it('reads a local number in the country picked in the sheet', async () => {
            renderSheet();
            fireEvent.click(screen.getByLabelText('phoneInput.countrySheetTitle'));
            fireEvent.click(screen.getByText('일본'));
            fill('090-1234-5678');
            share();

            await waitFor(() => expect(requestLink).toHaveBeenCalledWith({ name: '홍길동', phone: '+819012345678' }));
            // The pick is remembered for the next phone field, as the relay invite's field does.
            expect(localStorage.getItem(COUNTRY_STORAGE_KEY)).toBe('JP');
        });

        it('moves the picker to the country a pasted + number names, and keeps its local form', () => {
            renderSheet();
            fill('+819012345678');

            expect(screen.getByPlaceholderText('addFriend.phonePlaceholder')).toHaveValue('09012345678');
            expect(screen.getByText('+81')).toBeInTheDocument();
        });

        it.each([
            ['a foreign landline', '+81 3-1234-5678'],
            ['a Korean landline', '02-123-4567'],
            ['a number too short to be anything', '010-1234'],
            ['a number that fits no country', '+1 555 0100'],
        ])('rejects %s inline and issues nothing', (_, typed) => {
            renderSheet();
            fill(typed);
            share();

            expect(screen.getByText('addFriend.phoneInvalidFormat')).toBeInTheDocument();
            expect(requestLink).not.toHaveBeenCalled();
            // The error holds the button until the number is edited.
            expect(screen.getByText('addFriend.share').closest('button')).toBeDisabled();
        });

        it('rejects a Korean mobile while another country is picked', () => {
            localStorage.setItem(COUNTRY_STORAGE_KEY, 'JP');
            renderSheet();
            fill('010-1234-5678');
            share();

            expect(screen.getByText('addFriend.phoneInvalidFormat')).toBeInTheDocument();
            expect(requestLink).not.toHaveBeenCalled();
        });

        it('opens on the device locale when nothing was picked before', async () => {
            localStorage.clear();
            setLanguage('ja-JP');
            renderSheet();

            expect(screen.getByText('+81')).toBeInTheDocument();
        });

        it('opens on Korea when the locale names no region, so the old Korean-only case needs no pick', async () => {
            localStorage.clear();
            setLanguage('ko');
            renderSheet();
            fill('010-1234-5678');
            share();

            expect(screen.getByText('+82')).toBeInTheDocument();
            await waitFor(() => expect(requestLink).toHaveBeenCalledWith({ name: '홍길동', phone: '+821012345678' }));
        });
    });
});
