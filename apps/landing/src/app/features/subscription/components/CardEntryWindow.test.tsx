import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import i18n from '../../../../i18n';
import { registerSubscriptionCopy } from '../lib/i18n';
import { type CardEntryConfirmation, type CardEntryRequest, createCardEntryChannel } from '../lib/port/cardEntry';
import { CardEntryWindow } from './CardEntryWindow';

registerSubscriptionCopy();

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

/** A card field that is a plain input, and a confirmation the test decides. */
const fakeRequest = (answers: CardEntryConfirmation[], terms: CardEntryRequest['terms'] = {}) => {
    const confirm = vi.fn(async () => answers.shift() ?? { outcome: 'failed' as const });
    const unmount = vi.fn();
    const request: CardEntryRequest = {
        terms,
        mount: async node => {
            const input = document.createElement('input');
            input.setAttribute('aria-label', 'Card number');
            node.appendChild(input);
        },
        confirm,
        unmount,
    };
    return { request, confirm, unmount };
};

const open = (request: CardEntryRequest) => {
    const channel = createCardEntryChannel();
    render(
        <MemoryRouter>
            <CardEntryWindow channel={channel} />
        </MemoryRouter>
    );
    let done!: Promise<string>;
    act(() => {
        done = channel.open(request);
    });
    return done;
};

describe('CardEntryWindow', () => {
    it('states the recurring charge and registers the card only once it is agreed to', async () => {
        const { request, confirm } = fakeRequest([{ outcome: 'registered' }], {
            amount: { amount: 600, currency: 'USD' },
            firstChargeAt: '2026-11-08',
            withTrial: true,
        });
        const done = open(request);

        const dialog = await screen.findByRole('dialog', { name: 'Add a card' });
        expect(await within(dialog).findByLabelText('Card number')).toBeTruthy();
        expect(
            within(dialog).getByText(
                'When your trial ends on 2026.11.08, $6.00 is charged to this card, then the same amount on day 8 of every month.'
            )
        ).toBeTruthy();
        const submit = within(dialog).getByRole('button', { name: 'Add card' }) as HTMLButtonElement;
        await waitFor(() => expect(within(dialog).queryByRole('status')).toBeNull());
        expect(submit.disabled).toBe(true);

        fireEvent.click(within(dialog).getByLabelText('I agree to recurring charges to this card on these terms.'));
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);

        expect(await done).toBe('registered');
        expect(confirm).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('stays open for a field to fix, then ends with what the next try answers', async () => {
        const { request, confirm } = fakeRequest([{ outcome: 'retry' }, { outcome: 'failed' }]);
        const done = open(request);

        const dialog = await screen.findByRole('dialog', { name: 'Add a card' });
        await within(dialog).findByLabelText('Card number');
        fireEvent.click(within(dialog).getByRole('checkbox'));
        const submit = within(dialog).getByRole('button', { name: 'Add card' });
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('dialog', { name: 'Add a card' })).toBeTruthy();

        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        expect(await done).toBe('failed');
    });

    it('ends as a closed window when cancelled, and takes the field away', async () => {
        const { request, unmount } = fakeRequest([]);
        const done = open(request);

        const dialog = await screen.findByRole('dialog', { name: 'Add a card' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

        expect(await done).toBe('closed');
        await waitFor(() => expect(unmount).toHaveBeenCalled());
    });

    it('ends the request as closed when the dialog goes away with it still open', async () => {
        const { request, unmount } = fakeRequest([]);
        const channel = createCardEntryChannel();
        const view = render(
            <MemoryRouter>
                <CardEntryWindow channel={channel} />
            </MemoryRouter>
        );
        let done!: Promise<string>;
        act(() => {
            done = channel.open(request);
        });
        await screen.findByRole('dialog', { name: 'Add a card' });
        view.unmount();

        expect(await done).toBe('closed');
        expect(unmount).toHaveBeenCalled();
    });

    it('says the field did not load instead of waiting on it', async () => {
        const { request } = fakeRequest([]);
        request.mount = async () => {
            throw new Error('blocked');
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        void open(request);

        expect(await screen.findByText("The card field didn't load")).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Add card' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
