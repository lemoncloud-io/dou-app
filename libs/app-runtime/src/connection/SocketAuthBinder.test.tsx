import { render } from '@testing-library/react';

import { SocketAuthBinder } from './SocketAuthBinder';
import { getSocketManager, getSocketRuntime } from '../socket/runtime';
import type { RuntimeBinding } from '../runtime';

const mockUpdateAuth = jest.fn();
const mockMarkUnverified = jest.fn();
jest.mock('../socket/runtime', () => ({
    getSocketManager: jest.fn(),
    getSocketRuntime: jest.fn(),
}));

beforeEach(() => {
    mockUpdateAuth.mockClear();
    mockMarkUnverified.mockClear();
    (getSocketManager as jest.Mock).mockReturnValue({ markUnverified: mockMarkUnverified });
    (getSocketRuntime as jest.Mock).mockReturnValue({ sessionController: { updateAuth: mockUpdateAuth } });
});

const baseBinding = (overrides: Partial<RuntimeBinding['auth']> = {}): RuntimeBinding => ({
    context: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
    socket: { config: { url: 'wss://x', deviceId: 'd1', wssType: 'cloud' } },
    auth: { kind: 'cloud', siteId: 'site-1', identityToken: 'token-1', ...overrides },
});

describe('SocketAuthBinder', () => {
    it('does not re-auth on first mount', () => {
        render(<SocketAuthBinder binding={baseBinding()} />);
        expect(mockUpdateAuth).not.toHaveBeenCalled();
    });

    it('does NOT re-auth when only the siteId changes (optimistic switch, same token)', () => {
        const { rerender } = render(<SocketAuthBinder binding={baseBinding()} />);
        // Optimistic site switch: sid flips but identityToken is still the old one.
        rerender(<SocketAuthBinder binding={baseBinding({ siteId: 'site-2' })} />);
        expect(mockMarkUnverified).not.toHaveBeenCalled();
        expect(mockUpdateAuth).not.toHaveBeenCalled();
    });

    it('re-auths when the identity token changes (commit after refresh)', () => {
        const { rerender } = render(<SocketAuthBinder binding={baseBinding({ siteId: 'site-2' })} />);
        rerender(<SocketAuthBinder binding={baseBinding({ siteId: 'site-2', identityToken: 'token-2' })} />);
        expect(mockMarkUnverified).toHaveBeenCalledTimes(1);
        expect(mockUpdateAuth).toHaveBeenCalledWith('session-switch');
    });

    it('does not re-auth here when the socket itself changes (SocketBinder bootstraps)', () => {
        const { rerender } = render(<SocketAuthBinder binding={baseBinding()} />);
        const next: RuntimeBinding = {
            ...baseBinding({ identityToken: 'token-2' }),
            socket: { config: { url: 'wss://y', deviceId: 'd1', wssType: 'cloud' } },
        };
        rerender(<SocketAuthBinder binding={next} />);
        expect(mockUpdateAuth).not.toHaveBeenCalled();
    });
});
