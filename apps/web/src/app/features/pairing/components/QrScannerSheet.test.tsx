import { act, fireEvent, render, screen } from '@testing-library/react';

import { QrScannerSheet } from './QrScannerSheet';

type Handlers = { onCode: (code: string) => void; onNotOurs?: () => void };
const scanner = {
    start: jest.fn<Promise<void>, [HTMLVideoElement, Handlers]>(),
    stop: jest.fn(),
};

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('../lib/liveQrScanner', () => {
    class LiveQrOpenError extends Error {
        constructor(readonly reason: string) {
            super(reason);
        }
    }
    return { LiveQrOpenError, LiveQrScanner: jest.fn(() => scanner) };
});
const { LiveQrOpenError } = jest.requireMock('../lib/liveQrScanner') as {
    LiveQrOpenError: new (reason: string) => Error;
};

const props = () => ({ onCode: jest.fn(), onClose: jest.fn(), onUnavailable: jest.fn() });
const handlers = () => scanner.start.mock.calls[0][1];

beforeEach(() => {
    jest.clearAllMocks();
    scanner.start.mockResolvedValue(undefined);
});

describe('QrScannerSheet', () => {
    it('opens the camera into its video and hands on the code it reads', async () => {
        const p = props();
        render(<QrScannerSheet {...p} />);
        await act(async () => undefined);

        expect(scanner.start.mock.calls[0][0]).toBeInstanceOf(HTMLVideoElement);
        act(() => handlers().onCode('07344168'));
        expect(p.onCode).toHaveBeenCalledWith('07344168');
    });

    it('releases the camera when it closes', () => {
        const { unmount } = render(<QrScannerSheet {...props()} />);

        unmount();

        expect(scanner.stop).toHaveBeenCalled();
    });

    it('closes from its close button', () => {
        const p = props();
        render(<QrScannerSheet {...p} />);

        fireEvent.click(screen.getByTestId('pairing-qr-scanner-close'));

        expect(p.onClose).toHaveBeenCalled();
    });

    it('shows a passing note for a QR that is not ours, then the hint again', async () => {
        jest.useFakeTimers();
        try {
            render(<QrScannerSheet {...props()} />);
            await act(async () => undefined);
            const note = screen.getByTestId('pairing-qr-scanner-note');
            expect(note.textContent).toBe('pairing.approve.scanHint');

            act(() => handlers().onNotOurs?.());
            expect(note.textContent).toBe('pairing.approve.scanNotOurs');

            act(() => jest.advanceTimersByTime(2000));
            expect(note.textContent).toBe('pairing.approve.scanHint');
        } finally {
            jest.useRealTimers();
        }
    });

    it('says why when the camera cannot be opened', async () => {
        scanner.start.mockRejectedValue(new LiveQrOpenError('denied'));
        const p = props();
        render(<QrScannerSheet {...p} />);
        await act(async () => undefined);

        expect(p.onUnavailable).toHaveBeenCalledWith('denied');
    });

    it('says nothing once it was closed before the camera answered', async () => {
        let reject!: (error: unknown) => void;
        scanner.start.mockReturnValue(new Promise((_, r) => (reject = r)));
        const p = props();
        const { unmount } = render(<QrScannerSheet {...p} />);

        unmount();
        await act(async () => reject(new LiveQrOpenError('denied')));

        expect(p.onUnavailable).not.toHaveBeenCalled();
    });

    it('closes when the app goes to the background', () => {
        const p = props();
        render(<QrScannerSheet {...p} />);

        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        try {
            fireEvent(document, new Event('visibilitychange'));
        } finally {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        }

        expect(p.onClose).toHaveBeenCalled();
    });
});
