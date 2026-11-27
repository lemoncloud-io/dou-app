import type {
    WebhookDeleteInput,
    WebhookListInput,
    WebhookMakeTokenInput,
    WebhookUpdateInput,
} from '@lemoncloud/chatic-sockets-lib';
import type { WebhookWireView } from '@chatic/data-model';
import type { WebhookSocketDomainGateway } from '../gateways';

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
