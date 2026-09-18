import { UPLOAD_ROUTES } from 'lemon-model/upload';

import type {
    UploadCompleteBody,
    UploadCompleteResult,
    UploadSendBody,
    UploadService,
    UploadStartBody,
    UploadStartResult,
    UploadView,
} from 'lemon-model/upload';
import type { HttpGatewayExecutor } from './types';

/**
 * The upload slot API (`lemon-uploads-api`, type `uploads`) as the four operations the contract
 * defines. `UploadService` is the contract's own interface — the server controller and this client
 * adapter implement the same one, which is what lets the transfer method change without touching a
 * caller.
 *
 * Every operation is SIGNED. The deployed `serverless.yml` puts the generic `/{type}` routes behind
 * `authorizer: aws_iam`, and the lemon signature is computed per request over the body, so these
 * cannot be delegated to a shell that only carries a header map (the native bridge, for one). The
 * one unauthenticated hop is the presigned PUT, which never comes through this gateway.
 *
 * `endpoint` is injected rather than resolved from an `HttpRoute`. Destination and signing are
 * independent here (see `HttpRoute` in ../ports), and adding a route would imply a signing strategy
 * this service does not have its own of — it signs the relay way, at a different host.
 */
export type UploadsHttpGateway = UploadService;

/** `endpoint()` returns the service base INCLUDING the type segment, e.g. `https://…/uploads`. */
export const createUploadsHttpGateway = (exec: HttpGatewayExecutor, endpoint: () => string): UploadsHttpGateway => {
    const at = (path: string) => `${endpoint()}${path}`;
    const withId = (path: string, id: string) => at(path.replace('{id}', encodeURIComponent(id)));

    return {
        start: (body: UploadStartBody) =>
            exec.executeSignedRelayRequest<UploadStartResult, UploadStartBody>({
                method: 'POST',
                baseURL: at(UPLOAD_ROUTES.start.path),
                body,
            }),

        send: (id: string, body: UploadSendBody) =>
            exec.executeSignedRelayRequest<UploadView, UploadSendBody>({
                method: 'POST',
                baseURL: withId(UPLOAD_ROUTES.send.path, id),
                body,
            }),

        complete: (body: UploadCompleteBody) =>
            exec.executeSignedRelayRequest<UploadCompleteResult, UploadCompleteBody>({
                method: 'POST',
                baseURL: at(UPLOAD_ROUTES.complete.path),
                body,
            }),

        read: (id: string) =>
            exec.executeSignedRelayRequest<UploadView>({
                method: 'GET',
                baseURL: withId(UPLOAD_ROUTES.read.path, id),
            }),
    };
};
