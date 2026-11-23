const { withNxMetro } = require('@nx/react-native');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { sourceExts } = defaultConfig.resolver;

const customConfig = {
    cacheVersion: '@chatic/mobile',
    resolver: {
        sourceExts: [...sourceExts, 'cjs', 'mjs'],
    },
};

module.exports = withNxMetro(mergeConfig(defaultConfig, customConfig), {
    debug: false,
    extensions: [],
    watchFolders: [],
});
