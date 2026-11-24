import type { DomainMiniApp, DomainMiniAppStatus, MiniAppInput, MiniAppPatch } from '../../domain';
import type { MiniAppSocketDomainGateway } from '../gateways';
import { refuseMiniAppSave } from '../miniAppSaveRefused';

export type MiniAppWireUse = 'on' | 'off';

export type MiniAppWireStatus = 'active' | 'inactive' | 'held';

export interface MiniAppWireView {
    id: string;
    name?: string;
    url?: string;
    state$?: { use?: MiniAppWireUse; hold?: string };
    status?: MiniAppWireStatus;
}

export interface MiniAppWireList {
    list?: MiniAppWireView[];
    total?: number;
    page?: number;
    limit?: number;
}

interface MiniAppWireUpdate {
    id: string;
    name?: string;
    url?: string;
    state$?: { use: MiniAppWireUse };
}

export interface IMiniAppSocketDataSource {
    listMiniApps(): Promise<DomainMiniApp[]>;
    addMiniApp(input: MiniAppInput): Promise<DomainMiniApp>;
    updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp>;
    removeMiniApp(id: string): Promise<void>;
}

const STATUSES: readonly DomainMiniAppStatus[] = ['active', 'inactive', 'held'];

const toDomainMiniApp = (view: MiniAppWireView): DomainMiniApp => ({
    id: view.id,
    name: view.name ?? '',
    url: view.url ?? '',
    enabled: view.state$?.use === 'on',
    status: STATUSES.includes(view.status as DomainMiniAppStatus) ? (view.status as DomainMiniAppStatus) : 'inactive',
});

const toUse = (enabled: boolean): MiniAppWireUse => (enabled ? 'on' : 'off');

export class MiniAppSocketDataSource implements IMiniAppSocketDataSource {
    constructor(private readonly gateway: MiniAppSocketDomainGateway) {}

    async listMiniApps(): Promise<DomainMiniApp[]> {
        const result = await this.gateway.list<MiniAppWireList>();
        return (result?.list ?? []).filter(view => !!view?.id).map(toDomainMiniApp);
    }

    async addMiniApp(input: MiniAppInput): Promise<DomainMiniApp> {
        const view = await this.gateway
            .create<MiniAppWireView>({
                name: input.name,
                url: input.url,
                ...(input.enabled === undefined ? {} : { state$: { use: toUse(input.enabled) } }),
            })
            .catch(refuseMiniAppSave);
        return toDomainMiniApp(view);
    }

    async updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp> {
        const body: MiniAppWireUpdate = { id };
        if (patch.name !== undefined) body.name = patch.name;
        if (patch.url !== undefined) body.url = patch.url;
        if (patch.enabled !== undefined) body.state$ = { use: toUse(patch.enabled) };
        if (Object.keys(body).length === 1) {
            throw new Error(`[MiniAppSocketDataSource] nothing to update on mini app ${id}`);
        }
        const view = await this.gateway.update<MiniAppWireView>(body).catch(refuseMiniAppSave);
        return toDomainMiniApp(view);
    }

    async removeMiniApp(id: string): Promise<void> {
        await this.gateway.delete({ id }).catch(refuseMiniAppSave);
    }
}
