export const createQueryKeys = (resource: string) => {
    const all = [resource] as const;

    return {
        all,
        lists: () => [...all, 'list'] as const,
        list: (filters: Record<string, unknown>) => [...all, 'list', { filters }] as const,
        details: () => [...all, 'detail'] as const,
        detail: (id: string) => [...all, 'detail', id] as const,
        invalidateList: () => ({
            queryKey: [resource, 'list'],
            exact: false,
        }),
    };
};
