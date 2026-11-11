/**
 * `components/report-logs/console/tone.ts`
 * - Line emphasis for the readable timelines: errors and reports marked by a coloured edge and a
 *   faint wash, the text itself left in the normal colour.
 *
 * Colouring the words instead (red text on a red wash) costs contrast exactly on the lines that
 * matter most, so the colour goes to the edge and the label chip, and the sentence stays readable.
 */
import type { Tone } from '../../lib/describeRow';

export const TONE_ROW: Record<Tone, string> = {
    error: 'border-red-500 bg-red-500/[0.07]',
    report: 'border-blue-500 bg-blue-500/[0.07]',
    warn: 'border-amber-500/70',
    plain: 'border-transparent',
    stat: 'border-transparent',
};
