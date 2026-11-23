import type { HttpRoute } from '@chatic/http';

export type CredentialRecoveryFn = (route: HttpRoute) => Promise<boolean>;

export interface ICredentialRecoveryRegistry {
    register(fn: CredentialRecoveryFn | null): void;
    recover(route: HttpRoute): Promise<boolean>;
}

class CredentialRecoveryRegistry implements ICredentialRecoveryRegistry {
    private fn: CredentialRecoveryFn | null = null;

    register(fn: CredentialRecoveryFn | null): void {
        this.fn = fn;
    }

    async recover(route: HttpRoute): Promise<boolean> {
        if (!this.fn) return false;
        try {
            return await this.fn(route);
        } catch {
            return false;
        }
    }
}

export const credentialRecovery: ICredentialRecoveryRegistry = new CredentialRecoveryRegistry();
