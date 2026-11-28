// eslint-disable-next-line @nx/enforce-module-boundaries -- the React utility hooks moved to runtime-react; shared keeps its old names until its callers import the family directly
export {
    useCustomMutation,
    useDebounce,
    useGlobalLoader,
    useInterval,
    useLoaderStore,
    useVersionCheck,
    type MutationConfig,
    type VersionCheckConfig,
    type VersionCheckResult,
    type VersionInfo,
} from '@chatic/runtime-react/react-utils';
export * from './usePageTransition';
