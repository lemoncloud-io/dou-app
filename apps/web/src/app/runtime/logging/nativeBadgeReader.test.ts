import { nativeBadgeReader } from './nativeBadgeReader';

// The frame's icon badge, as the host's `appShell` port offers it; a browser has none. Which source a
// phone reads it from is the port's own business, and is covered beside the web app's implementation.
const mockRead = jest.fn();
let mockIconBadge = true;
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), iconBadge: mockIconBadge ? { read: mockRead } : null };
        },
    });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockIconBadge = true;
});

describe('nativeBadgeReader — what the device really shows', () => {
    it('is null where the frame has no icon badge to read, as in a browser', async () => {
        mockIconBadge = false;

        await expect(nativeBadgeReader.read()).resolves.toBeNull();
        expect(mockRead).not.toHaveBeenCalled();
    });

    it('answers what the frame reads', async () => {
        mockRead.mockResolvedValue(4);

        await expect(nativeBadgeReader.read()).resolves.toBe(4);
    });

    it('keeps an unknown value null rather than 0', async () => {
        mockRead.mockResolvedValue(null);

        await expect(nativeBadgeReader.read()).resolves.toBeNull();
    });
});
