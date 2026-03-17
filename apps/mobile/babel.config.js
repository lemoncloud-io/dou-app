module.exports = {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
        [
            'babel-plugin-transform-inline-environment-variables',
            {
                include: [
                    'NODE_ENV',
                    'VITE_ENV',
                    'VITE_PROJECT',
                    'VITE_REGION',
                    'VITE_OAUTH_ENDPOINT',
                    'VITE_HOST',
                    'VITE_SOCIAL_OAUTH_ENDPOINT',
                    'VITE_DOU_ENDPOINT',
                    'VITE_WS_ENDPOINT',
                ],
            },
        ],
        function () {
            return {
                visitor: {
                    MetaProperty(path) {
                        if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
                            if (path.parentPath.isMemberExpression() && path.parentPath.node.property.name === 'env') {
                                path.parentPath.replaceWithSourceString('process.env');
                            } else if (
                                path.parentPath.isMemberExpression() &&
                                path.parentPath.node.property.name === 'url'
                            ) {
                                path.parentPath.replaceWithSourceString('""');
                            } else {
                                path.replaceWithSourceString('({})');
                            }
                        }
                    },
                },
            };
        },
    ],
};
