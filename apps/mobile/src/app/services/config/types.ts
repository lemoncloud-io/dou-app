export interface IConfigKvService {
    /**
     * The whole bag, one round trip — what `FetchConfigBag` answers with.
     *
     * Namespaced under this service's own key prefix, so it can never return a key some OTHER
     * service (preference, app icon, …) happens to store on the same shared MMKV instance.
     */
    getAll(): Record<string, string>;

    /**
     * Stores one value, opaquely. This service does not know what the key means — the registry
     * that does lives in the web bundle, not here (ADR-0079 결정 9). It stores whatever string it
     * is given under whatever key it is given.
     */
    set(key: string, value: string): Promise<void>;

    remove(key: string): Promise<void>;
}
