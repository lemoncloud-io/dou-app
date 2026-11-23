const { execFileSync } = require('node:child_process');

exports.default = async function afterAllArtifactBuild(buildResult) {
    const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
    const dmgs = buildResult.artifactPaths.filter(p => p.endsWith('.dmg'));
    if (!dmgs.length || !APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) return [];

    const identity = process.env.MAC_SIGN_IDENTITY || 'Developer ID Application';
    for (const dmg of dmgs) {
        try {
            execFileSync('codesign', ['--force', '--sign', identity, '--timestamp', dmg], { stdio: 'inherit' });
        } catch (e) {
            console.warn(`dmg codesign skipped (${e.message}); relying on notarization + staple`);
        }
        execFileSync(
            'xcrun',
            [
                'notarytool',
                'submit',
                dmg,
                '--key',
                APPLE_API_KEY,
                '--key-id',
                APPLE_API_KEY_ID,
                '--issuer',
                APPLE_API_ISSUER,
                '--wait',
            ],
            { stdio: 'inherit' }
        );
        execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
    }
    return [];
};
