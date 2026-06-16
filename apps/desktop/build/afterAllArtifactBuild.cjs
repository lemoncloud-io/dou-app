const { execFileSync } = require('node:child_process');

// electron-builder notarizes + staples the .app, then builds the .dmg — but leaves the dmg
// itself unsigned and unstapled, so Gatekeeper rejects the *downloaded* dmg ("no usable
// signature"). Sign, notarize, and staple each dmg here so the distributed artifact passes.
// No-op without notarization credentials (dev / unsigned builds) → degrades gracefully.
exports.default = async function afterAllArtifactBuild(buildResult) {
    const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
    const dmgs = buildResult.artifactPaths.filter(p => p.endsWith('.dmg'));
    if (!dmgs.length || !APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) return [];

    const identity = process.env.MAC_SIGN_IDENTITY || 'Developer ID Application';
    for (const dmg of dmgs) {
        try {
            execFileSync('codesign', ['--force', '--sign', identity, '--timestamp', dmg], { stdio: 'inherit' });
        } catch (e) {
            // On CI the Developer ID lives in a temporary keychain codesign can't resolve by name.
            // The dmg signature is optional — notarization + stapling below is what Gatekeeper checks.
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
