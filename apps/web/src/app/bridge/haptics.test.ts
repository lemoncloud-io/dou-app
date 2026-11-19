import { haptics } from './haptics';

const play = jest.fn();
let mockHaptics = true;
// The frame's haptics, as the host's `appShell` port offers them; a browser has none.
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), haptics: mockHaptics ? { play } : null };
        },
    });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockHaptics = true;
});

describe('haptics', () => {
    it('plays each kind on the frame', () => {
        haptics.play('selection');
        haptics.play('impact');

        expect(play).toHaveBeenNthCalledWith(1, 'selection');
        expect(play).toHaveBeenNthCalledWith(2, 'impact');
    });

    it('plays nothing, and does not throw, where the frame has no haptics', () => {
        mockHaptics = false;

        expect(() => haptics.play('impact')).not.toThrow();
        expect(play).not.toHaveBeenCalled();
    });
});
