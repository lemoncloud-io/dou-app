import type { DataContext } from './types';

export const isForeignContext = (context: DataContext): boolean =>
    context.socketCid != null && (context.cid || 'default') !== context.socketCid;
