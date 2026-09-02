import type { HttpClient } from '../client';

/**
 * The executor gateways are built against. Rather than the doc-sketch `exec.request({route, ...})`,
 * this is simply `HttpClient` (1단계's output) — gateways already know whether their action is
 * signed/unsigned/cloud (that choice is baked into the wire vocabulary, same as the pre-lib
 * `executeRelayRequest`/`executeSignedRelayRequest` split), so a route-dispatching `request()` would
 * just be a second, redundant way to say the same thing. `resolveEndpoint` (2단계 addition to
 * `HttpClient`) is what lets a gateway build its own `baseURL` without knowing the host itself.
 * See libs/data/docs/http-data-path.md §검증 방법 — "HttpManager.getExecutor() 표면 미합의".
 */
export type HttpGatewayExecutor = HttpClient;
