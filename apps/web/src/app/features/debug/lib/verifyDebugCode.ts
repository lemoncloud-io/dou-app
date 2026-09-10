// Pure equality check, fail-closed: an unset/empty expected code never matches, even
// against an empty input. That empty case is the live one — `debug.entryCode` resolves to
// `''` on a build with no `VITE_DEBUG_CODE`, so this guard is what keeps the gate shut.
// The code is passed in rather than read here, which keeps this a plain, dependency-free
// function its test can call directly.
export const verifyDebugCode = (input: string, expected: string | undefined): boolean =>
    !!expected && input === expected;
