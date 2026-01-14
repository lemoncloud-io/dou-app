module.exports = {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
        [
            'transform-inline-environment-variables',
            {
                include: ['WEBVIEW_BASE_URL', 'APP_ENV'],
            },
        ],
    ],
};
