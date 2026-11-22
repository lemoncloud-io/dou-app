import { readCacheRoutes, resetActiveStorageForTests } from '../../app/runtime/activeStorage';
import { recordingRoutes } from './cache';

type Ports = Parameters<typeof recordingRoutes>[0];

const portsWith = (routed: jest.Mock): Ports =>
    ({ route: jest.fn(), storage: jest.fn(), routed, globalSearch: jest.fn(), metrics: jest.fn() }) as unknown as Ports;

describe('recordingRoutes', () => {
    afterEach(() => resetActiveStorageForTests());

    it('keeps the routes the assembly reported and still hands them to the ports', () => {
        const routed = jest.fn();
        const routes = [
            { type: 'chat' as const, route: 'native' },
            { type: 'invitecloud' as const, route: 'session' },
        ];

        recordingRoutes(portsWith(routed)).routed(routes);

        expect(routed).toHaveBeenCalledWith(routes);
        expect(readCacheRoutes()).toEqual(routes);
    });

    it('replaces the routes of an earlier assembly', () => {
        const ports = recordingRoutes(portsWith(jest.fn()));
        ports.routed([{ type: 'chat', route: 'web' }]);
        ports.routed([{ type: 'chat', route: 'native' }]);

        expect(readCacheRoutes()).toEqual([{ type: 'chat', route: 'native' }]);
    });

    it('leaves every other member of the ports as it was', () => {
        const ports = portsWith(jest.fn());
        const wrapped = recordingRoutes(ports);

        expect(wrapped.route).toBe(ports.route);
        expect(wrapped.storage).toBe(ports.storage);
        expect(wrapped.globalSearch).toBe(ports.globalSearch);
    });
});
