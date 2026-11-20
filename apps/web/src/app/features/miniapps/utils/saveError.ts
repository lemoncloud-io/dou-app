import { miniAppSaveProblemOf, type MiniAppSaveProblem } from '@chatic/runtime';
import { MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX } from '@chatic/shared';

/** Which field a save error is shown under, and its message key. */
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
};

const errorFor = (problem: MiniAppSaveProblem): MiniAppSaveError => {
    const { field, key } = BY_PROBLEM[problem];
    return { field, key, values: { max: field === 'name' ? MINI_APP_LINK_NAME_MAX : MINI_APP_LINK_LIMIT } };
};

/** The message for a problem the screen found before sending — the same rule the relay applies. */
export const saveErrorOfProblem = (problem: MiniAppSaveProblem): MiniAppSaveError => errorFor(problem);

/**
 * The message for a failed save. A refusal the relay gave for a save-rule reason is read with
 * `miniAppSaveProblemOf`, which gives the same answer whether the save ran here or across the bridge
 * (where the error arrives as a plain `Error`); anything else is the general "could not save".
 */
export const saveErrorOf = (error: unknown): MiniAppSaveError => {
    const problem = miniAppSaveProblemOf(error);
    return problem ? errorFor(problem) : { field: 'url', key: 'miniApps.error.failed', values: {} };
};
