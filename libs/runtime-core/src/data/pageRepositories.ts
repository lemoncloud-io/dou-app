import type { LinkedView } from '@lemoncloud/chatic-backend-api';

import type { DataRepositories, IAuthRepository, IPairingRepository, PhoneCodeProveOptions } from '@chatic/data';

/**
 * The auth repository's methods that answer with a session's token. They are the session's own use
 * cases' — `@chatic/auth` signs in, enters clouds and exchanges tokens with them — and a screen reaches
 * the same work through the session commands, which keep the token. So the page's graph has none of
 * them: on the phone the session's tokens never reach the page.
 */
export const TOKEN_ISSUING_AUTH_METHODS = [
    'confirmPhoneCode',
    'delegateCloud',
    'exchangeCode',
    'exchangeToken',
    'login',
    'loginWithInviteCode',
    'registerDevice',
    'verifyNativeToken',
    'verifyOAuthCode',
] as const satisfies readonly (keyof IAuthRepository)[];

type TokenIssuingAuthMethod = (typeof TOKEN_ISSUING_AUTH_METHODS)[number];

/**
 * The auth repository as a screen has it: the account checks and links, without the token issuers.
 * `confirmPhoneCode` stays for linking a phone to the account — its `link` mode answers with the
 * linked account, while `login` mode answers with a token and is the session command
 * `confirmPhoneLogin`'s.
 */
export interface PageAuthRepository extends Omit<IAuthRepository, TokenIssuingAuthMethod | 'dispose'> {
    confirmPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions & { mode: 'link' }
    ): Promise<LinkedView>;
}

/** The pairing repository as a screen has it. A claim can carry a session; it is the session command `claimPairing`. */
export type PagePairingRepository = Omit<IPairingRepository, 'claimPairing' | 'dispose'>;

type RepositoryKey = Exclude<keyof DataRepositories, 'withContext' | 'dispose'>;

/**
 * The repository graph as a screen has it — every repository, minus what answers with a session's
 * token and minus the lifecycle of the graph and of each repository (`withContext`, `dispose`),
 * which is the runtime's.
 */
export type PageRepositories = {
    [K in Exclude<RepositoryKey, 'auth' | 'pairing'>]: Omit<DataRepositories[K], 'dispose'>;
} & {
    auth: PageAuthRepository;
    pairing: PagePairingRepository;
};

/** The `code` a page's repository call throws with when it names a member the page's graph does not have. */
export const PAGE_REPOSITORY_REFUSED = 'PAGE_REPOSITORY_REFUSED';

const refuse = (what: string): never => {
    throw Object.assign(new Error(`${what} is not on the page's repository graph`), { code: PAGE_REPOSITORY_REFUSED });
};

const bindTo = <T extends object>(target: T, hidden: ReadonlySet<PropertyKey>, name: string): T =>
    new Proxy(target, {
        get(object, property) {
            if (hidden.has(property)) return () => refuse(`${name}.${String(property)}`);
            const value = Reflect.get(object, property, object);
            // Bound to the repository itself, so a method reaching its own private members works
            // whatever object it was read through.
            return typeof value === 'function' ? value.bind(object) : value;
        },
    });

const HIDDEN_REPOSITORY = new Set<PropertyKey>(['dispose']);
const HIDDEN_AUTH = new Set<PropertyKey>([
    'dispose',
    ...TOKEN_ISSUING_AUTH_METHODS.filter(method => method !== 'confirmPhoneCode'),
]);
const HIDDEN_PAIRING = new Set<PropertyKey>(['dispose', 'claimPairing']);
const HIDDEN_GRAPH = new Set<PropertyKey>(['withContext', 'dispose']);

const pageAuthOf = (auth: IAuthRepository): PageAuthRepository => {
    const bound = bindTo(auth, HIDDEN_AUTH, 'auth');
    return new Proxy(bound, {
        get(object, property, receiver) {
            if (property !== 'confirmPhoneCode') return Reflect.get(object, property, receiver);
            return (phone: string, otp: string, options: PhoneCodeProveOptions) =>
                // The types already say `link`; a caller that cast around them is still refused here.
                options?.mode === 'link'
                    ? auth.confirmPhoneCode(phone, otp, options)
                    : refuse("auth.confirmPhoneCode outside 'link' mode");
        },
    }) as unknown as PageAuthRepository;
};

// One page view per graph and per repository: screens put the repositories in effect dependencies, so
// a view has to keep its object's identity — a new one per read would re-run every such effect on
// every render.
const views = new WeakMap<DataRepositories, PageRepositories>();
const repositoryViews = new WeakMap<object, object>();

const pageRepositoryOf = (key: PropertyKey, repository: object): object => {
    const known = repositoryViews.get(repository);
    if (known) return known;
    const view =
        key === 'auth'
            ? pageAuthOf(repository as IAuthRepository)
            : bindTo(repository, key === 'pairing' ? HIDDEN_PAIRING : HIDDEN_REPOSITORY, String(key));
    repositoryViews.set(repository, view);
    return view;
};

/**
 * The page's view of one repository graph: the same repositories, with the token issuers and the
 * graph's lifecycle refused (`PAGE_REPOSITORY_REFUSED`) as well as left out of the type. The same
 * view for the same graph, every time.
 */
export const pageRepositoriesOf = (graph: DataRepositories): PageRepositories => {
    const known = views.get(graph);
    if (known) return known;
    const view = new Proxy(graph, {
        get(object, property) {
            if (HIDDEN_GRAPH.has(property)) return () => refuse(String(property));
            const value = Reflect.get(object, property, object);
            return value && typeof value === 'object' ? pageRepositoryOf(property, value) : value;
        },
    }) as unknown as PageRepositories;
    views.set(graph, view);
    return view;
};
