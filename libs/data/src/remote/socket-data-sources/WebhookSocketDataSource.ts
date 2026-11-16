import type {
    WebhookDeleteInput,
    WebhookListInput,
    WebhookMakeTokenInput,
    WebhookUpdateInput,
} from '@lemoncloud/chatic-sockets-lib';
import type { WebhookWireView } from '../../domain';
import type { WebhookSocketDomainGateway } from '../gateways';

/** `ListResult<WebhookView>` — only the part the app reads. */
export interface WebhookWireList {
    list?: WebhookWireView[];
    total?: number;
}

export interface IWebhookSocketDataSource {
    list(payload: WebhookListInput): Promise<WebhookWireList>;
    makeToken(payload: WebhookMakeTokenInput): Promise<WebhookWireView>;
    update(payload: WebhookUpdateInput): Promise<WebhookWireView>;
    delete(payload: WebhookDeleteInput): Promise<WebhookWireView>;
}

/**
 * Channel webhook management remote source. Every call rides the ACTIVE slot: a webhook belongs to
 * the channel's own cloud, like `channel.*`. The gateway answers `unknown`; the wire view is typed
 * here and mapped by the repository. Nothing is cached, so no `DataContext` — and the `Token` in a
 * `make-token` answer is passed up once and never retained.
 */
export class WebhookSocketDataSource implements IWebhookSocketDataSource {
    constructor(private readonly gateway: WebhookSocketDomainGateway) {}

    public list(payload: WebhookListInput): Promise<WebhookWireList> {
        return this.gateway.list<WebhookWireList>(payload);
    }

    public makeToken(payload: WebhookMakeTokenInput): Promise<WebhookWireView> {
        return this.gateway.makeToken<WebhookWireView>(payload);
    }

    public update(payload: WebhookUpdateInput): Promise<WebhookWireView> {
        return this.gateway.update<WebhookWireView>(payload);
    }

    public delete(payload: WebhookDeleteInput): Promise<WebhookWireView> {
        return this.gateway.delete<WebhookWireView>(payload);
    }
}
