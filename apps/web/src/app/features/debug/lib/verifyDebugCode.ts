// Pure equality check, fail-closed: an unset/empty expected code never matches, even
// against an empty input. The env read (import.meta.env) lives at the call site so this
// stays a plain function ts-jest can compile.
export const verifyDebugCode = (input: string, expected: string | undefined): boolean =>
    !!expected && input === expected;
