import type { HttpLogSink } from './log/networkLog';

export type HttpRoute = 'relay' | 'oauth' | 'iap';

export interface HttpRuntimePorts {
    resolveEndpoint(route: HttpRoute): string;
    isCredentialStale?(route: HttpRoute): boolean;
    recoverCredential?(route: HttpRoute): Promise<boolean>;
    logSink?: HttpLogSink;
    onAuthFailure?(error: unknown, message: string): void;
}
