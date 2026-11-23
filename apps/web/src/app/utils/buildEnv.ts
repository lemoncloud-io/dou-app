export const isDevBuild = (): boolean => {
    const env = import.meta.env?.VITE_ENV;
    return env === 'DEV' || env === 'LOCAL';
};
