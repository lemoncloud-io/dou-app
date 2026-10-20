import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addMembers = vi.fn();
vi.mock('../hooks', () => ({
    useAddMembers: () => ({ addMembers, isAdding: false }),
    useInviteCandidates: () => ({
        candidates: [{ id: 'u2', name: 'Bob', viaChannels: ['general'] }],
        isLoading: false,
        error: null,
    }),
}));

import { Toaster } from '@chatic/ui-kit/components/ui/toaster';

import '../../../../i18n';
import { useSiteProfilesStore } from '../../../shared';
import { AddMembersDialog } from './AddMembersDialog';

/**
 * Mounts the dialog only while open, as ChannelActionDialogs does. `keepOpener` false stands in
 * for the channel intro's button, which leaves the page once the channel has members.
 */
const Host = ({ keepOpener }: { keepOpener: boolean }) => {
    const [open, setOpen] = useState(false);
    const [added, setAdded] = useState(false);
    return (
        <>
            {(keepOpener || !added) && (
                <button type="button" onClick={() => setOpen(true)}>
                    Open
                </button>
            )}
            {open && (
                <AddMembersDialog
                    open
                    onOpenChange={next => {
                        setOpen(next);
                        if (!next) setAdded(true);
                    }}
                    channelId="C1"
                />
            )}
        </>
    );
};

const addBob = () => {
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bob/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to channel' }));
};

describe('AddMembersDialog focus after adding', () => {
    let composer: HTMLElement;
    beforeEach(() => {
        addMembers.mockResolvedValue(undefined);
        const main = document.createElement('main');
        composer = document.createElement('div');
        composer.setAttribute('data-composer-input', '');
        composer.tabIndex = 0;
        main.appendChild(composer);
        document.body.appendChild(main);
    });
    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('hands focus to the room composer when the button that opened it is gone', async () => {
        render(<Host keepOpener={false} />);
        addBob();

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(composer));
    });

    it('returns focus to the button that opened it while that button is still there', async () => {
        render(<Host keepOpener />);
        addBob();

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' })));
        expect(document.activeElement).not.toBe(composer);
    });
});

// A rejected add used to toast the server's wire text (`403 NOT ALLOWED - …`) alone, then nothing
// but a sentence. It now leads with the sentence and keeps the wire text under it.
describe('AddMembersDialog when adding fails', () => {
    afterEach(() => vi.clearAllMocks());

    it('toasts a sentence the person can act on, with the wire text under it', async () => {
        addMembers.mockRejectedValue(new Error('403 NOT ALLOWED - action[invite] is invalid @doPost(channels/C1)'));
        render(
            <>
                <Host keepOpener />
                <Toaster />
            </>
        );
        addBob();

        expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
        expect(screen.getByText('403 NOT ALLOWED - action[invite] is invalid @doPost(channels/C1)')).toBeTruthy();
    });
});

describe('AddMembersDialog names', () => {
    afterEach(() => {
        useSiteProfilesStore.getState().reset();
    });

    it("draws a candidate by this place's profile, and finds them by it", () => {
        // Somebody who shares no channel with me is known here only by the profile the member
        // list loaded, so the row has to read it rather than the account name.
        useSiteProfilesStore.getState().setAll({ u2: { nick: 'Bobby in this place' } });
        render(<AddMembersDialog open onOpenChange={() => undefined} channelId="C1" />);

        expect(screen.getByRole('checkbox', { name: /Bobby in this place/ })).toBeTruthy();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'this place' } });
        expect(screen.getByRole('checkbox', { name: /Bobby in this place/ })).toBeTruthy();
    });
});
