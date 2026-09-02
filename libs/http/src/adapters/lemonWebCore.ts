/**
 * The minimal `lemon-web-core` request-builder surface this lib drives. Declared here (not
 * imported from `@lemoncloud/lemon-web-core`'s `WebTransport` shape) as a consumer-owned `Pick` —
 * `init`/`isAuthenticated`/`getTokenStorage` are deliberately absent, which is the type-level half
 * of ADR-0070 결정 2 불변조건 3 (this lib never calls an API that can trigger lemon's own refresh).
 */
export interface LemonRequestBuilder {
    setBody: (body: unknown) => LemonRequestBuilder;
    setParams: (params: Record<string, unknown>) => LemonRequestBuilder;
    execute: <T>() => Promise<{ data: T }>;
}

export interface LemonRequestSurface {
    buildRequest(config: { method: string; baseURL: string }): LemonRequestBuilder;
    buildSignedRequest(config: { method: string; baseURL: string }): LemonRequestBuilder;
}

export interface LemonExecutorRequest {
    method: string;
    baseURL: string;
    body?: unknown;
    params?: Record<string, unknown>;
}

/**
 * Executes a request through the injected lemon builder surface — signed or unsigned, chosen at
 * construction. Two instances (signed=false, signed=true) cover `executeRelayRequest` and
 * `executeSignedRelayRequest` from the pre-lib `transport/request.ts`.
 */
export class LemonHttpExecutor {
    constructor(
        private readonly surface: LemonRequestSurface,
        private readonly signed: boolean
    ) {}

    async execute<T>(req: LemonExecutorRequest): Promise<{ data: T }> {
        const builder = this.signed
            ? this.surface.buildSignedRequest({ method: req.method, baseURL: req.baseURL })
            : this.surface.buildRequest({ method: req.method, baseURL: req.baseURL });

        if (req.params) builder.setParams(req.params);
        if (req.body !== undefined) builder.setBody(req.body);

        return builder.execute<T>();
    }
}
