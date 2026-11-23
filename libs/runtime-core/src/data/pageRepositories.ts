import type { LinkedView } from '@lemoncloud/chatic-backend-api';

import type { DataRepositories, IAuthRepository, IPairingRepository, PhoneCodeProveOptions } from '@chatic/data';

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

export interface PageAuthRepository extends Omit<IAuthRepository, TokenIssuingAuthMethod | 'dispose'> {
    confirmPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions & { mode: 'link' }
    ): Promise<LinkedView>;
}

export type PagePairingRepository = Omit<IPairingRepository, 'claimPairing' | 'dispose'>;

type RepositoryKey = Exclude<keyof DataRepositories, 'withContext' | 'dispose'>;

export type PageRepositories = {
    [K in Exclude<RepositoryKey, 'auth' | 'pairing'>]: Omit<DataRepositories[K], 'dispose'>;
} & {
    auth: PageAuthRepository;
    pairing: PagePairingRepository;
};

export const PAGE_REPOSITORY_REFUSED = 'PAGE_REPOSITORY_REFUSED';

const refuse = (what: string): never => {
    throw Object.assign(new Error(`${what} is not on the page's repository graph`), { code: PAGE_REPOSITORY_REFUSED });
};

const bindTo = <T extends object>(target: T, hidden: ReadonlySet<PropertyKey>, name: string): T =>
    new Proxy(target, {
        get(object, property) {
            if (hidden.has(property)) return () => refuse(`${name}.${String(property)}`);
            const value = Reflect.get(object, property, object);
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
                options?.mode === 'link'
                    ? auth.confirmPhoneCode(phone, otp, options)
                    : refuse("auth.confirmPhoneCode outside 'link' mode");
        },
    }) as unknown as PageAuthRepository;
};

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
