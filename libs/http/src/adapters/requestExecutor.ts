/**
 * The request-builder surface this lib drives: build a request, give it its query and body, send
 * it. `createRequestTransport` (`transport/requestTransport.ts`) implements it; tests hand in a fake.
 * Declared here as a consumer-owned shape so the client never depends on how a request is signed.
 */
export interface RequestBuilder {
    setBody: (body: unknown) => RequestBuilder;
    setParams: (params: Record<string, unknown>) => RequestBuilder;
    execute: <T>() => Promise<{ data: T }>;
}

export interface RequestSurface {
    buildRequest(config: { method: string; baseURL: string }): RequestBuilder;
    buildSignedRequest(config: { method: string; baseURL: string }): RequestBuilder;
}

export interface ExecutorRequest {
    method: string;
    baseURL: string;
    body?: unknown;
    params?: Record<string, unknown>;
}

/**
 * Executes a request through the injected surface — signed or unsigned, chosen at construction. Two
 * instances (signed=false, signed=true) back `executeRelayRequest` and `executeSignedRelayRequest`.
 */
export class HttpExecutor {
    constructor(
        private readonly surface: RequestSurface,
        private readonly signed: boolean
    ) {}

    async execute<T>(req: ExecutorRequest): Promise<{ data: T }> {
        const builder = this.signed
            ? this.surface.buildSignedRequest({ method: req.method, baseURL: req.baseURL })
            : this.surface.buildRequest({ method: req.method, baseURL: req.baseURL });

        if (req.params) builder.setParams(req.params);
        if (req.body !== undefined) builder.setBody(req.body);

        return builder.execute<T>();
    }
}
