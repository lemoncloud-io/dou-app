import type { InviteCreateInput, InviteListInput } from '@lemoncloud/chatic-sockets-lib';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteSocketDomainGateway } from '../gateways';

export type RelayInviteView = MyInviteView & { needVerify?: boolean };

interface InviteListPage {
    list?: MyInviteView[];
}

export interface IInviteSocketDataSource {
    listInvites(payload?: InviteListInput | null): Promise<MyInviteView[]>;
    createInvite(payload: InviteCreateInput): Promise<MyInviteView>;
    getInvite(code: string): Promise<RelayInviteView>;
    acceptInvite(code: string): Promise<MyInviteView>;
    cancelInvite(code: string): Promise<MyInviteView>;
    rejectInvite(code: string): Promise<MyInviteView>;
}

export class InviteSocketDataSource implements IInviteSocketDataSource {
    constructor(private readonly gateway: InviteSocketDomainGateway) {}

    public async listInvites(payload: InviteListInput | null = null): Promise<MyInviteView[]> {
        const page = await this.gateway.list<InviteListPage>(payload);
        return page?.list ?? [];
    }

    public async createInvite(payload: InviteCreateInput): Promise<MyInviteView> {
        return this.gateway.create<MyInviteView>(payload);
    }

    public async getInvite(code: string): Promise<RelayInviteView> {
        return this.gateway.get<RelayInviteView>({ code });
    }

    public async acceptInvite(code: string): Promise<MyInviteView> {
        return this.gateway.accept<MyInviteView>({ code });
    }

    public async cancelInvite(code: string): Promise<MyInviteView> {
        return this.gateway.cancel<MyInviteView>({ code });
    }

    public async rejectInvite(code: string): Promise<MyInviteView> {
        return this.gateway.reject<MyInviteView>({ code });
    }
}
