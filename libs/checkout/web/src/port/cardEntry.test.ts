import { type CardEntryRequest, createCardEntryChannel } from './cardEntry';

describe('the card entry channel', () => {
    const request = (): CardEntryRequest => ({
        terms: {},
        mount: async () => undefined,
        confirm: async () => ({ outcome: 'registered' }),
        unmount: () => undefined,
    });

    it('shows one request and resolves it with how the dialog ended', async () => {
        const channel = createCardEntryChannel();
        const listener = jest.fn();
        channel.subscribe(listener);
        const first = request();
        const done = channel.open(first);
        expect(channel.pending()).toBe(first);
        channel.finish('registered');
        expect(await done).toBe('registered');
        expect(channel.pending()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('closes a request still open when another arrives', async () => {
        const channel = createCardEntryChannel();
        const first = channel.open(request());
        const second = channel.open(request());
        expect(await first).toBe('closed');
        channel.finish('failed');
        expect(await second).toBe('failed');
    });
});
