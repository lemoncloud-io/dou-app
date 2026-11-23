import type { RelayMiniAppUpdateBody, RelayMiniAppUse, RelayMiniAppView } from '@chatic/http';
import type { DomainMiniApp, DomainMiniAppStatus, MiniAppInput, MiniAppPatch } from '../../domain';
import type { MiniAppHttpDomainGateway } from '../gateways';

export type MiniAppSaveProblem = 'nameMissing' | 'nameTooLong' | 'invalidUrl' | 'hubUrl' | 'tooMany';

const MINI_APP_SAVE_REFUSED = 'MiniAppSaveRefused';

export class MiniAppSaveRefused extends Error {
    readonly code: MiniAppSaveProblem;

    constructor(
        readonly problem: MiniAppSaveProblem,
        override readonly cause?: unknown
    ) {
        super(`[MiniAppHttpDataSource] save refused: ${problem}`);
        this.name = MINI_APP_SAVE_REFUSED;
        this.code = problem;
    }
}

const PROBLEMS: readonly MiniAppSaveProblem[] = ['nameMissing', 'nameTooLong', 'invalidUrl', 'hubUrl', 'tooMany'];

export const miniAppSaveProblemOf = (error: unknown): MiniAppSaveProblem | null => {
    const fields = error as { name?: unknown; code?: unknown } | null;
    if (fields?.name !== MINI_APP_SAVE_REFUSED) return null;
    return PROBLEMS.includes(fields.code as MiniAppSaveProblem) ? (fields.code as MiniAppSaveProblem) : null;
};

export interface IMiniAppHttpDataSource {
    listMiniApps(cloudId: string): Promise<DomainMiniApp[]>;
    addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp>;
    updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp>;
    removeMiniApp(id: string): Promise<void>;
}

const STATUSES: readonly DomainMiniAppStatus[] = ['active', 'inactive', 'held'];

const toDomainMiniApp = (view: RelayMiniAppView): DomainMiniApp => ({
    id: view.id,
    name: view.name ?? '',
    url: view.url ?? '',
    enabled: view.state$?.use === 'on',
    status: STATUSES.includes(view.status as DomainMiniAppStatus) ? (view.status as DomainMiniAppStatus) : 'inactive',
});

const toUse = (enabled: boolean): RelayMiniAppUse => (enabled ? 'on' : 'off');

const statusOf = (error: unknown): number | undefined => {
    const err = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null;
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

const textsOf = (error: unknown): string[] => {
    const err = error as { message?: unknown; response?: { data?: unknown } } | null;
    const data = err?.response?.data as { error?: unknown; message?: unknown } | string | undefined;
    const body = typeof data === 'string' ? data : typeof data?.error === 'string' ? data.error : data?.message;
    return [body, err?.message].filter((part): part is string => typeof part === 'string' && part !== '');
};

const HEAD = /^\s*(\d{3})\s+([A-Z][A-Z ]*?)\s+-\s+(.*)$/s;

const problemIn = (text: string, status: number | undefined): MiniAppSaveProblem | null => {
    const head = HEAD.exec(text);
    if (!head) return null;
    const [, leading, code, words] = head;
    const effective = status ?? Number(leading);
    if (effective === 409) return code === 'QUOTA EXCEEDED' ? 'tooMany' : null;
    if (effective !== 400 || code !== 'INVALID') return null;
    const verdict = /^\.url\[.*\] is (invalid|hub)\b/s.exec(words)?.[1];
    if (verdict === 'hub') return 'hubUrl';
    if (verdict === 'invalid') return 'invalidUrl';
    if (words.startsWith('.url (string) is required')) return 'invalidUrl';
    if (words.startsWith('.name (string) is required')) return 'nameMissing';
    if (words.startsWith('.name is too long')) return 'nameTooLong';
    return null;
};

const problemOf = (error: unknown): MiniAppSaveProblem | null => {
    const status = statusOf(error);
    for (const text of textsOf(error)) {
        const problem = problemIn(text, status);
        if (problem) return problem;
    }
    return null;
};

const refusing = (error: unknown): never => {
    const problem = problemOf(error);
    throw problem ? new MiniAppSaveRefused(problem, error) : error;
};

export class MiniAppHttpDataSource implements IMiniAppHttpDataSource {
    constructor(private readonly gateway: MiniAppHttpDomainGateway) {}

    async listMiniApps(cloudId: string): Promise<DomainMiniApp[]> {
        const result = await this.gateway.list(cloudId);
        return (result?.list ?? []).filter(view => !!view?.id).map(toDomainMiniApp);
    }

    async addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp> {
        const view = await this.gateway
            .create({
                cloudId,
                name: input.name,
                url: input.url,
                ...(input.enabled === undefined ? {} : { state$: { use: toUse(input.enabled) } }),
            })
            .catch(refusing);
        return toDomainMiniApp(view);
    }

    async updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp> {
        const body: RelayMiniAppUpdateBody = {};
        if (patch.name !== undefined) body.name = patch.name;
        if (patch.url !== undefined) body.url = patch.url;
        if (patch.enabled !== undefined) body.state$ = { use: toUse(patch.enabled) };
        if (Object.keys(body).length === 0) {
            throw new Error(`[MiniAppHttpDataSource] nothing to update on mini app ${id}`);
        }
        const view = await this.gateway.update(id, body).catch(refusing);
        return toDomainMiniApp(view);
    }

    async removeMiniApp(id: string): Promise<void> {
        await this.gateway.remove(id);
    }
}
