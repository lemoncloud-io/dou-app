const name = 'dou-import-meta';
const version = 2;

const factory = tsCompiler => {
    const ts = tsCompiler.configSet.compilerModule;
    return context => {
        const f = context.factory;
        const callRequire = moduleName =>
            f.createCallExpression(f.createIdentifier('require'), undefined, [f.createStringLiteral(moduleName)]);
        const importMeta = () =>
            f.createParenthesizedExpression(
                f.createObjectLiteralExpression([
                    f.createPropertyAssignment(
                        'env',
                        f.createObjectLiteralExpression([
                            f.createPropertyAssignment('MODE', f.createStringLiteral('test')),
                            f.createPropertyAssignment('DEV', f.createFalse()),
                            f.createPropertyAssignment('PROD', f.createTrue()),
                            f.createPropertyAssignment('SSR', f.createFalse()),
                            f.createPropertyAssignment('BASE_URL', f.createStringLiteral('/')),
                        ])
                    ),
                    f.createPropertyAssignment(
                        'url',
                        f.createPropertyAccessExpression(
                            f.createCallExpression(
                                f.createPropertyAccessExpression(callRequire('url'), 'pathToFileURL'),
                                undefined,
                                [f.createIdentifier('__filename')]
                            ),
                            'href'
                        )
                    ),
                    f.createPropertyAssignment('filename', f.createIdentifier('__filename')),
                    f.createPropertyAssignment('dirname', f.createIdentifier('__dirname')),
                ])
            );
        const visit = node => {
            if (
                ts.isMetaProperty(node) &&
                node.keywordToken === ts.SyntaxKind.ImportKeyword &&
                node.name.text === 'meta'
            ) {
                return importMeta();
            }
            return ts.visitEachChild(node, visit, context);
        };
        return sourceFile => ts.visitNode(sourceFile, visit);
    };
};

module.exports = { name, version, factory };
