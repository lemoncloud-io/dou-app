import type { CloudView } from '@lemoncloud/chatic-backend-api';

export const keepCandidates = <T extends CloudView>(clouds: T[]): T[] =>
    clouds.filter(c => !!c.id && c.status !== 'expired' && c.state$?.life !== 'released');

export const isMarkedForDrop = (cloud: CloudView): boolean => cloud.state$?.plan === 'drop';

export const hasDropMarks = (clouds: CloudView[]): boolean => clouds.some(isMarkedForDrop);

export const initialKeepIds = (candidates: CloudView[]): string[] =>
    hasDropMarks(candidates) ? candidates.filter(c => !isMarkedForDrop(c)).map(c => c.id as string) : [];

export const toDropIds = (candidates: CloudView[], keepIds: string[]): string[] => {
    const keep = new Set(keepIds);
    return candidates.filter(c => !keep.has(c.id as string)).map(c => c.id as string);
};

export const needsKeepChoice = (candidateCount: number, nextLimit: number | null | undefined): boolean =>
    typeof nextLimit === 'number' && candidateCount > nextLimit;

export const toggleKeep = (selected: string[], id: string, limit: number): string[] => {
    if (selected.includes(id)) return selected.filter(s => s !== id);
    const next = [...selected, id];
    return next.length > limit ? next.slice(next.length - limit) : next;
};

export const isSameKeepChoice = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every(id => b.includes(id));

export const findHeldClouds = <T extends CloudView>(clouds: T[]): T[] =>
    clouds.filter(c => c.state$?.hold === 'downgrade' && c.state$?.life !== 'released');
