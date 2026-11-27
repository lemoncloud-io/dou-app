import type { CacheType } from '@chatic/bridge-messages';
import { KeyValueTable } from '@chatic/data';
import type { DataContextProvider } from '@chatic/data';
import { WebStore } from '@chatic/storage';

export class WebStorageAdapter<TType extends CacheType> extends KeyValueTable<TType> {
    constructor(storage: Storage, type: TType, contextProvider: DataContextProvider) {
        super(new WebStore(storage), type, contextProvider);
    }
}
