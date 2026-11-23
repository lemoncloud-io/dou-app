import { diagnosticsKind } from '../../config/diagnosticsKind';

let owner: 'web' | 'native' | undefined;

export const setLaunchSessionOwner = (next: 'web' | 'native' | undefined): void => {
    owner = next;
};

export const readLaunchSessionOwner = (): 'web' | 'native' | undefined =>
    diagnosticsKind() === 'shell' ? owner : undefined;
