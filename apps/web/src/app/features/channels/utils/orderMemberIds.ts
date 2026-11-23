export const orderMemberIdsOwnerFirst = (ownerId: string | undefined, memberIds: string[], max: number): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const push = (id: string | undefined) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
    };

    push(ownerId);
    for (const id of memberIds) push(id);

    return max >= 0 ? ordered.slice(0, max) : ordered;
};
