import { coreEngine } from './engine';

const mockSessionController = { id: 'session' };
const mockConnectionController = { id: 'connection' };
const mockPrime = jest.fn(async () => 'ready' as const);
jest.mock('./session/sessionController', () => ({ createSessionController: jest.fn(() => mockSessionController) }));
jest.mock('./connection/connectionController', () => ({
    createConnectionController: jest.fn(() => mockConnectionController),
}));
jest.mock('./session/relayCredentialGuard', () => ({ RelayCredentialGuard: jest.fn() }));
jest.mock('./session/cloudCredentialGuard', () => ({ CloudCredentialGuard: jest.fn() }));
jest.mock('./push/pushRegistration', () => ({ PushRegistration: jest.fn() }));
jest.mock('./sync/primeChatRoom', () => ({ primeChatRoom: (...args: unknown[]) => mockPrime(...(args as [])) }));
// The core engine makes its session view when it is defined, so the mock's own value is read back below.
jest.mock('./session/sessionView', () => ({ createCoreSessionView: jest.fn(() => ({ id: 'session-view' })) }));

const { createSessionController } = jest.requireMock('./session/sessionController');
const { createConnectionController } = jest.requireMock('./connection/connectionController');
const { RelayCredentialGuard } = jest.requireMock('./session/relayCredentialGuard');
const { CloudCredentialGuard } = jest.requireMock('./session/cloudCredentialGuard');
const { PushRegistration } = jest.requireMock('./push/pushRegistration');
const { createCoreSessionView } = jest.requireMock('./session/sessionView');
// Read before any `clearAllMocks`: the view was made once, when the engine module loaded.
const madeViews = [...createCoreSessionView.mock.results];

beforeEach(() => jest.clearAllMocks());

describe('coreEngine', () => {
    const deviceId = () => 'device-1';

    it('makes the core session and connection controllers with the options it is given', () => {
        expect(coreEngine.sessionController({ deviceId })).toBe(mockSessionController);
        expect(createSessionController).toHaveBeenCalledWith({ deviceId });

        expect(coreEngine.connectionController({ deviceId })).toBe(mockConnectionController);
        expect(createConnectionController).toHaveBeenCalledWith({ deviceId });
    });

    it('makes a new guard per call, with the policy it is given', () => {
        const first = coreEngine.relayCredentialGuard({ intervalMs: null });
        const second = coreEngine.relayCredentialGuard({ intervalMs: null });
        coreEngine.cloudCredentialGuard({ marginMs: 1 });

        expect(first).not.toBe(second);
        expect(RelayCredentialGuard).toHaveBeenCalledWith({ intervalMs: null });
        expect(CloudCredentialGuard).toHaveBeenCalledWith({ marginMs: 1 });
    });

    it('makes a push registration with the options it is given', () => {
        const options = { delegate: () => null, deviceIds: () => ({ deviceId: 'device-1' }) };

        coreEngine.pushRegistration(options);

        expect(PushRegistration).toHaveBeenCalledWith(options);
    });

    it("reads the session through one core session view, this process's stores", () => {
        expect(madeViews).toHaveLength(1);
        expect(coreEngine.session).toBe(madeViews[0].value);
    });

    it('primes a chat room through the core prime', async () => {
        const cancelled = () => false;

        await expect(coreEngine.primeChatRoom('cloud-a', 'ch-1', { cancelled })).resolves.toBe('ready');

        expect(mockPrime).toHaveBeenCalledWith('cloud-a', 'ch-1', { cancelled });
    });
});
