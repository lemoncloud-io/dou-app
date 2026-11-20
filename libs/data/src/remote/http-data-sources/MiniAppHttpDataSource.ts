import type { RelayMiniAppUpdateBody, RelayMiniAppUse, RelayMiniAppView } from '@chatic/http';
import type { DomainMiniApp, DomainMiniAppStatus, MiniAppInput, MiniAppPatch } from '../../domain';
import type { MiniAppHttpDomainGateway } from '../gateways';

/**
 * Why the relay refused to save a mini app, in the save rule's own words. The codes are spelled like
 * the app's local link check (`MiniAppLinkProblem` in `@chatic/shared`) so a screen can show one
 * message table for both; the type lives here because this lib does not import `@chatic/shared`.
 * `tooMany` has no local counterpart: only the relay counts a cloud's mini apps.
 */
export type MiniAppSaveProblem = 'nameMissing' | 'nameTooLong' | 'invalidUrl' | 'hubUrl' | 'tooMany';

const MINI_APP_SAVE_REFUSED = 'MiniAppSaveRefused';

/**
 * A save the relay refused for one of the save rule's reasons. Anything else — not the owner (403), no
 * such cloud or mini app (404), the network — is rethrown as it came.
 *
 * Where the shell's runtime owns the session, the page calls the repository across the bridge, and
 * what crosses is an error's `name`, `message` and `code` — not its class or other fields. So the
 * reason rides as `code` too, under a fixed `name`: read those two (see {@link miniAppSaveProblemOf})
 * and the answer is the same whichever process ran the save.
 */
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

/** The save-rule reason a thrown error carries, in this process or after crossing the bridge; else `null`. */
export const miniAppSaveProblemOf = (error: unknown): MiniAppSaveProblem | null => {
    const fields = error as { name?: unknown; code?: unknown } | null;
    if (fields?.name !== MINI_APP_SAVE_REFUSED) return null;
    return PROBLEMS.includes(fields.code as MiniAppSaveProblem) ? (fields.code as MiniAppSaveProblem) : null;
};

export interface IMiniAppHttpDataSource {
    /** The cloud's mini apps in the order they were added, whatever their status. */
    listMiniApps(cloudId: string): Promise<DomainMiniApp[]>;
    addMiniApp(cloudId: string, input: MiniAppInput): Promise<DomainMiniApp>;
    /** Sends only the fields present in `patch`; an empty patch is refused before anything is sent. */
    updateMiniApp(id: string, patch: MiniAppPatch): Promise<DomainMiniApp>;
    removeMiniApp(id: string): Promise<void>;
}

const STATUSES: readonly DomainMiniAppStatus[] = ['active', 'inactive', 'held'];

/**
 * A missing or unknown status reads as `inactive`: reading it as `active` could open a mini app an
 * admin is holding, so the doubt falls on the closed side.
 */
const toDomainMiniApp = (view: RelayMiniAppView): DomainMiniApp => ({
    id: view.id,
    name: view.name ?? '',
    url: view.url ?? '',
    enabled: view.state$?.use === 'on',
    status: STATUSES.includes(view.status as DomainMiniAppStatus) ? (view.status as DomainMiniAppStatus) : 'inactive',
});

const toUse = (enabled: boolean): RelayMiniAppUse => (enabled ? 'on' : 'off');

/** The HTTP status of a failed request, wherever the error carries it. */
const statusOf = (error: unknown): number | undefined => {
    const err = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null;
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

/**
 * Where the relay's error text may be: the response body (a string, or one with `error`/`message`),
 * and the error's own message — an error thrown from a 200 body's `error` field carries it there.
 * Each is read on its own, never joined, so one cannot lend the other a line.
 */
const textsOf = (error: unknown): string[] => {
    const err = error as { message?: unknown; response?: { data?: unknown } } | null;
    const data = err?.response?.data as { error?: unknown; message?: unknown } | string | undefined;
    const body = typeof data === 'string' ? data : typeof data?.error === 'string' ? data.error : data?.message;
    return [body, err?.message].filter((part): part is string => typeof part === 'string' && part !== '');
};

/** The relay's words after its `<status> <CODE> - ` head, e.g. `.name is too long (max 30) - …`. */
const HEAD = /^\s*(\d{3})\s+([A-Z][A-Z ]*?)\s+-\s+(.*)$/s;

/**
 * The refusal one relay message states. Every fixed part is matched from the start of the words after
 * the head, never anywhere in the text: the address the user typed is copied into the message, and it
 * may contain anything — another rule's words, a newline. For the same reason the address verdict is
 * the last `] is …`, the relay's own words after the address.
 */
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

/**
 * Reads a refusal off the relay's error by its status and the fixed part of its message, never the
 * whole message: the address and the count are inside it. The status is the response's, or the
 * number the relay starts every error message with.
 *
 * The fixed parts are copied from the relay's error table and each has a test line. If the relay
 * rewords one, those tests still pass; only a run against the relay notices, and until then that
 * refusal surfaces as an ordinary error.
 */
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

/**
 * The relay's mini apps of a cloud. Wire → domain mapping and turning a relay refusal into a save-rule
 * reason both happen here and nowhere else. **No local cache write** — react-query owns these reads,
 * like the cloud catalog's. Names and addresses are sent as given: the relay trims them, and checking
 * them before a save is the screen's job.
 */
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
        // Built field by field, never by spreading a mini app that was read: a read view carries
        // `state$.hold`, and the relay refuses an owner's body in which that key exists at all.
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
