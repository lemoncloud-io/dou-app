import { miniAppSaveProblemOf, type MiniAppSaveProblem } from '@chatic/runtime';
import { MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX } from '@chatic/shared';

export interface MiniAppSaveError {
    field: 'name' | 'url';
    key: string;
    values: Record<string, number>;
}

const BY_PROBLEM: Record<MiniAppSaveProblem, Omit<MiniAppSaveError, 'values'>> = {
    nameMissing: { field: 'name', key: 'miniApps.error.nameMissing' },
    nameTooLong: { field: 'name', key: 'miniApps.error.nameTooLong' },
    invalidUrl: { field: 'url', key: 'miniApps.error.invalidUrl' },
    hubUrl: { field: 'url', key: 'miniApps.error.hubUrl' },
    tooMany: { field: 'url', key: 'miniApps.error.tooMany' },
    notAllowed: { field: 'url', key: 'miniApps.error.notAllowed' },
};

const errorFor = (problem: MiniAppSaveProblem): MiniAppSaveError => {
    const { field, key } = BY_PROBLEM[problem];
    return { field, key, values: { max: field === 'name' ? MINI_APP_LINK_NAME_MAX : MINI_APP_LINK_LIMIT } };
};

export const saveErrorOfProblem = (problem: MiniAppSaveProblem): MiniAppSaveError => errorFor(problem);

export const saveErrorOf = (error: unknown): MiniAppSaveError => {
    const problem = miniAppSaveProblemOf(error);
    return problem ? errorFor(problem) : { field: 'url', key: 'miniApps.error.failed', values: {} };
};
