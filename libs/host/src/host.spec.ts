import { HostFacade } from './host';

describe('host', () => {
    it('refuses a read before the entry point publishes', () => {
        const facade = new HostFacade();

        expect(facade.isPublished).toBe(false);
        expect(() => facade.ports).toThrow('before the app');
    });

    it('returns what was published, frozen', () => {
        const facade = new HostFacade();
        const ports = {};

        facade.publish(ports);

        expect(facade.isPublished).toBe(true);
        expect(facade.ports).toEqual(ports);
        expect(Object.isFrozen(facade.ports)).toBe(true);
    });

    it('refuses a second publish and keeps the first', () => {
        const facade = new HostFacade();
        facade.publish({});
        const first = facade.ports;

        expect(() => facade.publish({})).toThrow('already published');
        expect(facade.ports).toBe(first);
    });

    it('can be published again after a test reset', () => {
        const facade = new HostFacade();
        facade.publish({});
        facade.resetForTests();

        expect(facade.isPublished).toBe(false);
        expect(() => facade.publish({})).not.toThrow();
    });
});
