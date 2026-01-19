module.exports = {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
        [
            'transform-inline-environment-variables',
            {
                include: ['VITE_WEBVIEW_BASE_URL', 'VITE_ENV', 'VITE_WS_ENDPOINT'],
            },
        ],
    ],
};
