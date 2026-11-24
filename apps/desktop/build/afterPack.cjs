const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { DoU: koreanBrand } = require('./locales/ko.json');

const koreanName = productName => productName.replace(/^DoU/, koreanBrand);

const writeKoreanName = (appPath, productName) => {
    const name = koreanName(productName);
    const dir = join(appPath, 'Contents', 'Resources', 'ko.lproj');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'InfoPlist.strings'),
        `"CFBundleDisplayName" = ${JSON.stringify(name)};\n"CFBundleName" = ${JSON.stringify(name)};\n`
    );
};

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') return;
    const { productFilename, productName } = context.packager.appInfo;
    const appPath = join(context.appOutDir, `${productFilename}.app`);
    writeKoreanName(appPath, productName);
    if (process.env.CSC_LINK) return;
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
