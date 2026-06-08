const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

// Apple Silicon refuses to launch an unsigned arm64 binary — the kernel SIGKILLs it on start
// (no crash log, the window never appears). We ship unsigned for internal distribution (no
// Apple Developer cert yet, see ADR-0003), so ad-hoc sign the packaged .app here: the minimum
// signature that lets it run locally. Replaced by real Developer ID signing + notarization later.
exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') return;
    // When a real Developer ID cert is provided (CSC_LINK, prod CI), let electron-builder do the
    // proper signing + notarization instead — skip the ad-hoc stopgap.
    if (process.env.CSC_LINK) return;
    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
