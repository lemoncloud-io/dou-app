import { classifyError } from './classify';

import type { HttpRuntimePorts } from '../ports';

export interface ICredentialRecoverer {
    tryRecover(error: unknown): Promise<boolean>;
}

export class PortCredentialRecoverer implements ICredentialRecoverer {
    constructor(private readonly ports: HttpRuntimePorts) {}

    async tryRecover(error: unknown): Promise<boolean> {
        const route = classifyError(error).refreshRoute;
        if (!route || !this.ports.recoverCredential) {
            return false;
        }
        try {
            return await this.ports.recoverCredential(route);
        } catch {
            return false;
        }
    }
}

export class NoCredentialRecovery implements ICredentialRecoverer {
    async tryRecover(): Promise<boolean> {
        return false;
    }
}
