import { HttpExecutor } from './adapters/requestExecutor';
import { isBypassed } from './policy/bypass';
import { CredentialFailureAttributor } from './error/attribution';
import { classifyError } from './error/classify';
import { PortCredentialRecoverer } from './error/recovery';
import { withNetworkLog } from './log/networkLog';

import type { RequestSurface } from './adapters/requestExecutor';
import type { BypassRule } from './policy/bypass';
import type { IFailureAttributor, SigningContext } from './error/attribution';
import type { ICredentialRecoverer } from './error/recovery';
import type { HttpMethod } from './log/networkLog';
import type { HttpRoute, HttpRuntimePorts } from './ports';

export interface HttpRequestOptions<TBody = unknown, TParams = Record<string, unknown>> {
    method: HttpMethod;
    baseURL: string;
    body?: TBody;
    params?: TParams;
    allowRecordError?: boolean;
    bypass?: BypassRule[];
}

export const throwIfApiError = <T>(data: T & { error?: string }): T => {
    if (data.error) throw new Error(data.error);
    return data;
};

interface Executor {
    execute<T>(req: {
        method: HttpMethod;
        baseURL: string;
        body?: unknown;
        params?: Record<string, unknown>;
    }): Promise<{
        data: T;
    }>;
}

export interface HttpClient {
    executeRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse>;
    executeSignedRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse>;
    resolveEndpoint(route: HttpRoute): string;
}

class HttpClientImpl implements HttpClient {
    private static readonly RELAY_UNSIGNED: SigningContext = { route: 'relay', signed: false };
    private static readonly RELAY_SIGNED: SigningContext = { route: 'relay', signed: true };

    private readonly unsignedExecutor: Executor;
    private readonly signedExecutor: Executor;

    constructor(
        requestSurface: RequestSurface,
        private readonly ports: HttpRuntimePorts,
        private readonly attributor: IFailureAttributor = new CredentialFailureAttributor(ports),
        private readonly recoverer: ICredentialRecoverer = new PortCredentialRecoverer(ports)
    ) {
        this.unsignedExecutor = new HttpExecutor(requestSurface, false);
        this.signedExecutor = new HttpExecutor(requestSurface, true);
    }

    executeRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse> {
        return this.run<TResponse, TBody, TParams>(req, this.unsignedExecutor, HttpClientImpl.RELAY_UNSIGNED);
    }

    executeSignedRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse> {
        return this.run<TResponse, TBody, TParams>(req, this.signedExecutor, HttpClientImpl.RELAY_SIGNED);
    }

    resolveEndpoint(route: HttpRoute): string {
        return this.ports.resolveEndpoint(route);
    }

    private async run<TResponse, TBody, TParams>(
        req: HttpRequestOptions<TBody, TParams>,
        executor: Executor,
        ctx: SigningContext,
        recovered = false
    ): Promise<TResponse> {
        try {
            return await this.execute<TResponse, TBody, TParams>(req, executor, ctx);
        } catch (error) {
            if (recovered || !(await this.recoverer.tryRecover(error))) {
                this.reportAuthFailure(error, req);
                throw error;
            }
            return this.run<TResponse, TBody, TParams>(req, executor, ctx, true);
        }
    }

    private reportAuthFailure(error: unknown, req: HttpRequestOptions<unknown, unknown>): void {
        const classification = classifyError(error);
        if (!classification.shouldLogout) return;
        this.ports.onAuthFailure?.(error, `${req.method} ${req.baseURL} - ${classification.message}`);
    }

    private async execute<TResponse, TBody, TParams>(
        req: HttpRequestOptions<TBody, TParams>,
        executor: Executor,
        ctx: SigningContext
    ): Promise<TResponse> {
        const sink = isBypassed(req.bypass, 'networkLog') ? undefined : this.ports.logSink;

        const { data } = await withNetworkLog(
            {
                method: req.method,
                url: req.baseURL,
                params: req.params,
                body: req.body,
                allowRecordError: req.allowRecordError,
            },
            () =>
                executor
                    .execute<TResponse & { error?: string }>({
                        method: req.method,
                        baseURL: req.baseURL,
                        body: req.body,
                        params: req.params as Record<string, unknown> | undefined,
                    })
                    .catch(error => {
                        throw this.attributor.attribute(error, ctx);
                    }),
            sink
        );

        return req.allowRecordError ? data : throwIfApiError(data);
    }
}

export const createHttpClient = (requestSurface: RequestSurface, ports: HttpRuntimePorts): HttpClient =>
    new HttpClientImpl(requestSurface, ports);
