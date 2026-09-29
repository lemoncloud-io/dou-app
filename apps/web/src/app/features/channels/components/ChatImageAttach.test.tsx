import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { useChatImageAttach } from './ChatImageAttach';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const photo = (name: string, type = 'image/jpeg', lastModified = 1) => new File(['x'], name, { type, lastModified });

const Harness = ({ sendImages, disabled }: { sendImages: (files: File[]) => Promise<void>; disabled?: boolean }) => {
    const { button, overlays } = useChatImageAttach({ sendImages, disabled });
    return (
        <>
            {button}
            {overlays}
        </>
    );
};

const pick = (testId: string, files: File[]) => {
    const input = screen.getByTestId(testId) as HTMLInputElement;
    act(() => {
        fireEvent.change(input, { target: { files } });
    });
    return input;
};

beforeEach(() => toast.mockClear());

describe('useChatImageAttach', () => {
    it('sends what was picked at once, in pick order', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.jpg', 'image/jpeg', 1), photo('b.png', 'image/png', 2)]);

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.png']);
        expect(toast).not.toHaveBeenCalled();
    });

    it('sends the rest and says why once when part of the pick is refused', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.heic', 'image/heic'), photo('b.pdf', 'application/pdf'), photo('c.jpg')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['c.jpg']);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });

    it('sends nothing when nothing passes', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.gif', 'video/mp4')]);

        expect(sendImages).not.toHaveBeenCalled();
    });

    it('cuts a pick at ten and names the limit', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick(
            'chat-attach-library',
            Array.from({ length: 11 }, (_, i) => photo(`p${i}.jpg`, 'image/jpeg', i))
        );

        expect(sendImages.mock.calls[0][0]).toHaveLength(10);
        expect(toast.mock.calls[0][0].title).toBe('chat.attach.rejected.limit:{"max":10}');
    });

    // Without clearing, picking the same photo right after would not fire a change at all.
    it('clears the input so the same photo can be picked again', () => {
        render(<Harness sendImages={jest.fn().mockResolvedValue(undefined)} />);

        const input = pick('chat-attach-camera', [photo('a.jpg')]);

        expect(input.value).toBe('');
    });

    it('tells the user when the send itself fails', async () => {
        const sendImages = jest.fn().mockRejectedValue(new Error('offline'));
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.jpg')]);
        await act(async () => undefined);

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.sendFailed', variant: 'destructive' });
    });

    it('gives the camera its own capturing input and keeps the album one free of it', () => {
        render(<Harness sendImages={jest.fn()} />);

        expect(screen.getByTestId('chat-attach-camera')).toHaveAttribute('capture', 'environment');
        expect(screen.getByTestId('chat-attach-library')).not.toHaveAttribute('capture');
        expect(screen.getByTestId('chat-attach-library')).toHaveAttribute('multiple');
    });

    it('locks the button with the composer', () => {
        render(<Harness sendImages={jest.fn()} disabled />);

        expect(screen.getByRole('button', { name: 'chat.attach.open' })).toBeDisabled();
    });
});
