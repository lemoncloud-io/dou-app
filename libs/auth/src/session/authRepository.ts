import type { IAuthRepository } from '@chatic/data';

export interface IAuthRepositorySource {
    provide(get: (() => IAuthRepository) | null): void;
    get(): IAuthRepository;
}

class AuthRepositorySource implements IAuthRepositorySource {
    private accessor: (() => IAuthRepository) | null = null;

    provide(get: (() => IAuthRepository) | null): void {
        this.accessor = get;
    }

    get(): IAuthRepository {
        if (!this.accessor) {
            throw new Error('[auth] no AuthRepository — createRuntime() wires it before anything logs in');
        }
        return this.accessor();
    }
}

export const authRepositorySource: IAuthRepositorySource = new AuthRepositorySource();
