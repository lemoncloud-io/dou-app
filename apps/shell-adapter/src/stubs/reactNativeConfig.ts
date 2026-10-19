/**
 * Stands in for `react-native-config` in the mobile modules the shell loads. `deeplinkUtils.ts` reads
 * one value from it — `VITE_ENV`, which decides the custom scheme a bare path is resolved under — so
 * that is the one value given: the backend the shell page runs against, read when a link is resolved.
 */
interface ShellWindow {
    virtualShell?: { status(): { env: 'dev' | 'prod' } };
}

const Config = {
    get VITE_ENV(): 'DEV' | 'PROD' {
        return (globalThis as ShellWindow).virtualShell?.status().env === 'prod' ? 'PROD' : 'DEV';
    },
};

export default Config;
