export const verifyDebugCode = (input: string, expected: string | undefined): boolean =>
    !!expected && input === expected;
