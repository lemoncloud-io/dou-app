import type { IAuthRepository } from '@chatic/data';

import { authRepositorySource } from './authRepository';

describe('authRepositorySource', () => {
    afterEach(() => authRepositorySource.provide(null));

    it('throws a message naming initAppRuntime when nothing was provided', () => {
        expect(() => authRepositorySource.get()).toThrow(/initAppRuntime/);
    });

    it('reads through the accessor on every call, so a graph built later is the one returned', () => {
        const first = { delegateCloud: jest.fn() } as unknown as IAuthRepository;
        const second = { delegateCloud: jest.fn() } as unknown as IAuthRepository;
        let current = first;
        authRepositorySource.provide(() => current);

        expect(authRepositorySource.get()).toBe(first);
        current = second;
        expect(authRepositorySource.get()).toBe(second);
    });

    it('is unwired again after provide(null)', () => {
        authRepositorySource.provide(() => ({}) as IAuthRepository);
        authRepositorySource.provide(null);

        expect(() => authRepositorySource.get()).toThrow(/initAppRuntime/);
    });
});
