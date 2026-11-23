import type { DomainChat } from '../domain';

export const revisedIdsOf = (rows: Array<Pick<DomainChat, 'subType' | 'edit$'>>): string[] =>
    [...new Set(rows.filter(row => row?.subType === 'edit').map(row => `${row.edit$?.chatId ?? ''}`))].filter(Boolean);

export const readRevisedTargets = async <T extends { id?: string }>(
    ids: string[],
    get: (id: string) => Promise<T | undefined>
): Promise<{ changed: T[]; failed: Array<{ id: string; error: unknown }> }> => {
    const reads = await Promise.all(
        ids.map(async id => {
            try {
                return { id, row: await get(id), error: undefined as unknown };
            } catch (error) {
                return { id, row: undefined, error: error ?? new Error(`read failed - ${id}`) };
            }
        })
    );
    return {
        changed: reads.map(read => read.row).filter((row): row is T => !!row?.id),
        failed: reads.filter(read => read.error !== undefined).map(({ id, error }) => ({ id, error })),
    };
};

export const isGoneFailure = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : `${error ?? ''}`;
    const code = /^\s*(\d{3})\b/.exec(message)?.[1];
    return code === '403' || code === '404';
};
