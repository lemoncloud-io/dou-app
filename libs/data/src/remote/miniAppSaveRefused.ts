export type MiniAppSaveProblem = 'nameMissing' | 'nameTooLong' | 'invalidUrl' | 'hubUrl' | 'tooMany' | 'notAllowed';

const MINI_APP_SAVE_REFUSED = 'MiniAppSaveRefused';

export class MiniAppSaveRefused extends Error {
    readonly code: MiniAppSaveProblem;

    constructor(
        readonly problem: MiniAppSaveProblem,
        override readonly cause?: unknown
    ) {
        super(`[MiniAppSaveRefused] save refused: ${problem}`);
        this.name = MINI_APP_SAVE_REFUSED;
        this.code = problem;
    }
}

const PROBLEMS: readonly MiniAppSaveProblem[] = [
    'nameMissing',
    'nameTooLong',
    'invalidUrl',
    'hubUrl',
    'tooMany',
    'notAllowed',
];

export const miniAppSaveProblemOf = (error: unknown): MiniAppSaveProblem | null => {
    const fields = error as { name?: unknown; code?: unknown } | null;
    if (fields?.name !== MINI_APP_SAVE_REFUSED) return null;
    return PROBLEMS.includes(fields.code as MiniAppSaveProblem) ? (fields.code as MiniAppSaveProblem) : null;
};

const statusOf = (error: unknown): number | undefined => {
    const err = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null;
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

const textsOf = (error: unknown): string[] => {
    const err = error as { message?: unknown; response?: { data?: unknown } } | null;
    const data = err?.response?.data as { error?: unknown; message?: unknown } | string | undefined;
    const body = typeof data === 'string' ? data : typeof data?.error === 'string' ? data.error : data?.message;
    return [body, err?.message].filter((part): part is string => typeof part === 'string' && part !== '');
};

const HEAD = /^\s*(\d{3})\s+([A-Z][A-Z ]*?)\s+-\s+(.*)$/s;

const problemIn = (text: string, status: number | undefined): MiniAppSaveProblem | null => {
    const head = HEAD.exec(text);
    if (!head) return null;
    const [, leading, code, words] = head;
    const effective = status ?? Number(leading);
    if (effective === 403) return code === 'NOT ALLOWED' && words.startsWith('action[') ? 'notAllowed' : null;
    if (effective === 409) return code === 'QUOTA EXCEEDED' ? 'tooMany' : null;
    if (effective !== 400 || code !== 'INVALID') return null;
    const verdict = /^\.url\[.*\] is (invalid|hub)\b/s.exec(words)?.[1];
    if (verdict === 'hub') return 'hubUrl';
    if (verdict === 'invalid') return 'invalidUrl';
    if (words.startsWith('.url (string) is required')) return 'invalidUrl';
    if (words.startsWith('.name (string) is required')) return 'nameMissing';
    if (words.startsWith('.name is too long')) return 'nameTooLong';
    return null;
};

const problemOf = (error: unknown): MiniAppSaveProblem | null => {
    const status = statusOf(error);
    for (const text of textsOf(error)) {
        const problem = problemIn(text, status);
        if (problem) return problem;
    }
    return null;
};

export const refuseMiniAppSave = (error: unknown): never => {
    const problem = problemOf(error);
    throw problem ? new MiniAppSaveRefused(problem, error) : error;
};
