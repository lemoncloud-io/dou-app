import type { AuthPort } from '@chatic/ports';

export interface NodeAuthOptions {
    search?: string;
    leaveToHome?: AuthPort['leaveToHome'];
}

export const nodeAuthPorts = ({ search = '', leaveToHome = () => undefined }: NodeAuthOptions = {}): AuthPort => ({
    currentSearch: () => search,
    leaveToHome,
});
