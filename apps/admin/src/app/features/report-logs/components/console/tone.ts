import type { Tone } from '../../lib/describeRow';

export const TONE_ROW: Record<Tone, string> = {
    error: 'border-red-500 bg-red-500/[0.07]',
    report: 'border-blue-500 bg-blue-500/[0.07]',
    warn: 'border-amber-500/70',
    plain: 'border-transparent',
    stat: 'border-transparent',
};
