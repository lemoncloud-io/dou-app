#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { readGradleVersion, updatePbxproj, CONFIG } = require('../version-mobile');

const ROOT = path.resolve(__dirname, '..', '..');

function injectIosVersion(pbxContent, gradleContent, next) {
    if (!/^\d+\.\d+\.\d+$/.test(next.versionName || '')) {
        throw new Error(`version must be X.Y.Z (got ${next.versionName})`);
    }
    if (!/^\d+$/.test(String(next.versionCode || ''))) {
        throw new Error(`build must be a number (got ${next.versionCode})`);
    }
    const current = readGradleVersion(gradleContent);
    return updatePbxproj(pbxContent, current, { versionName: next.versionName, versionCode: Number(next.versionCode) });
}

function main(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i += 2) options[argv[i].replace(/^--/, '')] = argv[i + 1];
    const pbxFile = path.resolve(ROOT, options.pbxproj || CONFIG.pbxprojPath);
    const gradleFile = path.resolve(ROOT, options.gradle || CONFIG.gradlePath);
    const next = injectIosVersion(fs.readFileSync(pbxFile, 'utf8'), fs.readFileSync(gradleFile, 'utf8'), {
        versionName: options.version,
        versionCode: options.build,
    });
    fs.writeFileSync(pbxFile, next);
    console.log(`iOS app targets set to ${options.version} (${options.build}) in ${path.relative(ROOT, pbxFile)}`);
}

require('./io').runMain(module, main);

module.exports = { injectIosVersion, main };
