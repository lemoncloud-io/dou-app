/**
 * `api/errorCause.ts`
 * - Flattens an `Error.cause` chain into something a report can carry.
 *
 * `new Error(msg, { cause: original })` is how a wrapper keeps hold of what
 * actually broke, and libraries do it routinely — React wraps a render failure
 * this way, so a thrown `JSON.parse` surfaces as "Minified React error #520"
 * with the real fault sitting in `cause`. The wrapper's own stack points at the
 * wrapping site, so a report that keeps only `error.stack` names the code that
 * re-threw instead of the code that failed.
 *
 * Bounded on three axes because a report is a payload, not a heap dump: chain
 * depth, per-stack characters, and total characters. A cycle
 * (`a.cause = b; b.cause = a`) is possible too — wrappers get re-wrapped — so
 * visited errors are tracked rather than trusted to terminate.
 */

/** One link of the chain, in the order it was unwrapped (outermost first). */
export interface ReportedCause {
    message: string;
    stack?: string;
}

const MAX_DEPTH = 5;
const MAX_STACK_CHARS = 4_000;
const MAX_TOTAL_CHARS = 12_000;

const truncate = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…(+${value.length - max})` : value;

/** `cause` is `unknown` by contract — anything can be thrown, not just Errors. */
const describe = (value: unknown): ReportedCause => {
    if (value instanceof Error) {
        return {
            message: value.message || value.name || 'Error',
            stack: value.stack ? truncate(value.stack, MAX_STACK_CHARS) : undefined,
        };
    }

    if (typeof value === 'object' && value !== null) {
        // A rejected DOM Event or a plain object: String() collapses both to
        // something useless, so prefer a message-ish field when one exists.
        const record = value as { message?: unknown; type?: unknown };
        const label =
            typeof record.message === 'string'
                ? record.message
                : typeof record.type === 'string'
                  ? `${record.type} event`
                  : undefined;
        return { message: truncate(label ?? Object.prototype.toString.call(value), MAX_STACK_CHARS) };
    }

    return { message: truncate(String(value), MAX_STACK_CHARS) };
};

/**
 * The chain hanging off `error.cause`, outermost first. `error` itself is not
 * included — the report already carries its message and stack.
 */
export const collectCauses = (error: unknown): ReportedCause[] => {
    const causes: ReportedCause[] = [];
    const seen = new Set<unknown>([error]);
    let budget = MAX_TOTAL_CHARS;
    let current: unknown = (error as { cause?: unknown })?.cause;

    while (current !== undefined && current !== null && causes.length < MAX_DEPTH) {
        if (seen.has(current)) {
            causes.push({ message: '[circular cause]' });
            break;
        }
        seen.add(current);

        const described = describe(current);
        const cost = described.message.length + (described.stack?.length ?? 0);
        if (cost > budget) {
            // Dropping the stack usually fits; dropping the link entirely loses
            // the fact that there was more chain, so say so instead.
            causes.push({ message: truncate(described.message, Math.max(budget, 0)) });
            break;
        }

        budget -= cost;
        causes.push(described);
        current = (current as { cause?: unknown })?.cause;
    }

    return causes;
};
