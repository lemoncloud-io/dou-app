import { SocketsRepository } from './SocketsRepository';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';

describe('SocketsRepository', () => {
    const createRepository = () => {
        const remote = {
            findConnection: jest.fn().mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 }),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const listeners = new Map<string, (...args: unknown[]) => void>();
        const domainEventBus = {
            on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                listeners.set(event, cb);
                return () => listeners.delete(event);
            }),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new SocketsRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote, domainEventBus, listeners };
    };

    it('findConnection 호출 시 remoteDataSource.findConnection을 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;

        const result = await repository.findConnection(payload);

        expect(remote.findConnection).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });

    it('socket:create 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('socket:create');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'socket-1' } });

        expect(logSpy).toHaveBeenCalledWith('[SocketsRepository] socket:create', { id: 'socket-1' });
        logSpy.mockRestore();
    });

    it('socket:update 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('socket:update');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'socket-1' } });

        expect(logSpy).toHaveBeenCalledWith('[SocketsRepository] socket:update', { id: 'socket-1' });
        logSpy.mockRestore();
    });

    it('connection:create 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('connection:create');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'conn-1' } });

        expect(logSpy).toHaveBeenCalledWith('[SocketsRepository] connection:create', { id: 'conn-1' });
        logSpy.mockRestore();
    });

    it('connection:update 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('connection:update');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'conn-1' } });

        expect(logSpy).toHaveBeenCalledWith('[SocketsRepository] connection:update', { id: 'conn-1' });
        logSpy.mockRestore();
    });

    it('connection:delete 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('connection:delete');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'conn-1' } });

        expect(logSpy).toHaveBeenCalledWith('[SocketsRepository] connection:delete', { id: 'conn-1' });
        logSpy.mockRestore();
    });
});
