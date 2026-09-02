import { LemonHttpExecutor } from './adapters/lemonWebCore';
import { isBypassed } from './policy/bypass';
import { CredentialFailureAttributor } from './error/attribution';
import { PortCredentialRecoverer } from './error/recovery';
import { withNetworkLog } from './log/networkLog';

import type { LemonRequestSurface } from './adapters/lemonWebCore';
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
    /**
     * Set when the 200 body is a domain RECORD whose own `error` field is DATA, not a failed call.
     *
     * A cloud row keeps its last provisioning trace in `error` (`.accountNo[...] is invalid
     * (duplicated by 1000038)`) even after `status` moves on, so endpoints that answer with the
     * record — `POST /clouds/{id}/release` — would otherwise report a plain success as a failure.
     */
    allowRecordError?: boolean;
    bypass?: BypassRule[];
}

/** Throws a standard Error when the API response contains an `error` field. */
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
    /**
     * Default host for a route, for callers that build their own `baseURL` string (gateways —
     * see libs/data/docs/http-data-path.md). A passthrough to `HttpRuntimePorts.resolveEndpoint`;
     * added in 2단계 to close a gap 1단계 left open (`resolveEndpoint` existed on the port but
     * nothing in `client.ts` called it yet).
     */
    resolveEndpoint(route: HttpRoute): string;
}

/**
 * The request executors, wired to the injected lemon surface and `HttpRuntimePorts` (endpoints,
 * logging, credential staleness/recovery, auth-failure reaction). Constructed only by
 * `createHttpClient` below — consumers hold the `HttpClient` interface, never this class
 * (ADR-0070 결정 0).
 *
 * Two executors, not three: the SigV4 one served the cloud HTTP refresh alone and went with it.
 * A request bound for a cloud host is signed the relay way and carries its own `baseURL`.
 */
class HttpClientImpl implements HttpClient {
    /** Route + signedness per entry point, as constants: the pair is fixed by which method you call. */
    private static readonly RELAY_UNSIGNED: SigningContext = { route: 'relay', signed: false };
    private static readonly RELAY_SIGNED: SigningContext = { route: 'relay', signed: true };

    private readonly lemonUnsigned: Executor;
    private readonly lemonSigned: Executor;

    constructor(
        lemonSurface: LemonRequestSurface,
        private readonly ports: HttpRuntimePorts,
        private readonly attributor: IFailureAttributor = new CredentialFailureAttributor(ports),
        private readonly recoverer: ICredentialRecoverer = new PortCredentialRecoverer(ports)
    ) {
        this.lemonUnsigned = new LemonHttpExecutor(lemonSurface, false);
        this.lemonSigned = new LemonHttpExecutor(lemonSurface, true);
    }

    executeRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse> {
        return this.run<TResponse, TBody, TParams>(req, this.lemonUnsigned, HttpClientImpl.RELAY_UNSIGNED);
    }

    executeSignedRelayRequest<TResponse, TBody = unknown, TParams = Record<string, unknown>>(
        req: HttpRequestOptions<TBody, TParams>
    ): Promise<TResponse> {
        return this.run<TResponse, TBody, TParams>(req, this.lemonSigned, HttpClientImpl.RELAY_SIGNED);
    }

    resolveEndpoint(route: HttpRoute): string {
        return this.ports.resolveEndpoint(route);
    }

    /**
     * Runs the request, and when a lapsed credential explains a failure, re-mints it and sends the
     * request ONCE more.
     *
     * **Why replaying is safe for this failure only.** The rejection being recovered from happens at
     * API Gateway's IAM layer — the signature is refused before any handler runs, so the request
     * provably had no effect. That is what makes replaying a POST acceptable here, and why the retry
     * is gated on the stale-credential verdict rather than on the HTTP method or an idempotency flag.
     *
     * **Why exactly once.** A second failure after a successful re-mint means the credential was not
     * the problem; retrying again would only loop on a request that cannot succeed.
     */
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
                throw error;
            }
            return this.run<TResponse, TBody, TParams>(req, executor, ctx, true);
        }
    }

    /** One attempt: sign, send, log, and unwrap the 200-body `error` convention. */
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
            // Attribution runs INSIDE the logged call so the error `withNetworkLog` records is
            // already stamped, and any future log field can read the verdict off it.
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

/**
 * Assembles the client. `HttpManager` (app-runtime) is the only intended caller — it owns the port
 * implementations, this owns the request mechanics.
 */
export const createHttpClient = (lemonSurface: LemonRequestSurface, ports: HttpRuntimePorts): HttpClient =>
    new HttpClientImpl(lemonSurface, ports);
