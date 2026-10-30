import { isLinkDown, isLinkKnownDown } from './linkState';

const mockGetSlotKeys = jest.fn();
const mockIsSlotVerified = jest.fn();

jest.mock('./runtime', () => ({
    getSocketManager: () => ({
        getSlotKeys: (...args: unknown[]) => mockGetSlotKeys(...args),
        isSlotVerified: (...args: unknown[]) => mockIsSlotVerified(...args),
    }),
}));

const setBrowserOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
};

beforeEach(() => {
    jest.resetAllMocks();
    mockGetSlotKeys.mockReturnValue(['relay', 'cloud-1']);
    mockIsSlotVerified.mockReturnValue(false);
    setBrowserOnline(true);
});

describe('isLinkDown', () => {
    it.each([
        [true, true, false],
        [true, false, false],
        [false, true, false],
        [false, false, true],
    ])('browser online=%s, verified socket=%s → link down=%s', (isBrowserOnline, hasVerifiedSocket, expected) => {
        expect(isLinkDown({ isBrowserOnline, hasVerifiedSocket })).toBe(expected);
    });
});

describe('isLinkKnownDown', () => {
    it('reads the link as up without consulting the sockets while the browser is online', () => {
        expect(isLinkKnownDown()).toBe(false);
        expect(mockGetSlotKeys).not.toHaveBeenCalled();
    });

    it('reads the link as down when the browser is offline and no slot is verified', () => {
        setBrowserOnline(false);

        expect(isLinkKnownDown()).toBe(true);
    });

    it('reads the link as up when the browser is stuck offline but a non-active slot is still verified', () => {
        setBrowserOnline(false);
        mockIsSlotVerified.mockImplementation((key: string) => key === 'cloud-1');

        expect(isLinkKnownDown()).toBe(false);
    });

    it('reads the link as down when the browser is offline and no slot is bound at all', () => {
        setBrowserOnline(false);
        mockGetSlotKeys.mockReturnValue([]);

        expect(isLinkKnownDown()).toBe(true);
    });
});
