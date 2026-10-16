import { SHELL_CONFIG } from '../shell/config';

/**
 * Stands in for `react-native-config` in the mobile modules the shell loads. `deeplinkUtils.ts` reads
 * one value from it — `VITE_ENV`, which decides the custom scheme a bare path is resolved under — so
 * that is the one value given, from the backend this shell was started against.
 */
const Config = { VITE_ENV: SHELL_CONFIG.env === 'prod' ? 'PROD' : 'DEV' };

export default Config;
