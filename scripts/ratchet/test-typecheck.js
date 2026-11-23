'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const { ROOT, listFiles } = require('./files');

const BASELINE_FILE = path.join(ROOT, 'scripts/ratchet/test-typecheck-ratchet-baseline.json');
const VERIFY_WORKFLOW = path.join(ROOT, '.github/workflows/verify.yml');
const TEST_FILE = /\.(spec|test)\.[cm]?tsx?$/;

const rootRequire = createRequire(path.join(ROOT, 'package.json'));

const projectName = dir => {
    for (const file of ['project.json', 'package.json']) {
        try {
            const name = JSON.parse(fs.readFileSync(path.join(ROOT, dir, file), 'utf8')).name;
            if (name) return name;
        } catch {
            continue;
        }
    }
    return path.basename(dir);
};

const excludedProjects = () => {
    const match = fs.readFileSync(VERIFY_WORKFLOW, 'utf8').match(/-t typecheck\s+--exclude=(\S+)/);
    return new Set(match ? match[1].split(',') : []);
};

const buildInfoPath = (ts, parsed, configPath) => ts.getTsBuildInfoEmitOutputFilePath(parsed.options) || configPath;

const coveredFiles = (ts, rootConfig) => {
    const covered = new Set();
    const seenBuildInfo = new Set();
    const visited = new Set();
    const visit = configPath => {
        if (visited.has(configPath) || !fs.existsSync(configPath)) return;
        visited.add(configPath);
        const parsed = ts.getParsedCommandLineOfConfigFile(
            configPath,
            {},
            { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
        );
        if (!parsed) return;
        const projectFiles = parsed.fileNames.length > 0;
        if (projectFiles) {
            const buildInfo = buildInfoPath(ts, parsed, configPath);
            if (!seenBuildInfo.has(buildInfo)) {
                seenBuildInfo.add(buildInfo);
                for (const file of parsed.fileNames) covered.add(path.resolve(file));
            }
        }
        for (const reference of parsed.projectReferences || []) {
            const target =
                fs.existsSync(reference.path) && fs.statSync(reference.path).isDirectory()
                    ? path.join(reference.path, 'tsconfig.json')
                    : reference.path;
            if (path.dirname(target) === path.dirname(rootConfig)) visit(target);
        }
    };
    visit(rootConfig);
    return covered;
};

const measure = () => {
    const ts = rootRequire('typescript');
    const excluded = excludedProjects();
    const testsByProject = new Map();
    for (const file of listFiles(['apps/*', 'libs/*']).filter(file => TEST_FILE.test(file))) {
        const dir = file.split('/').slice(0, 2).join('/');
        if (!testsByProject.has(dir)) testsByProject.set(dir, []);
        testsByProject.get(dir).push(file);
    }
    const result = {};
    for (const [dir, tests] of [...testsByProject].sort()) {
        const rootConfig = path.join(ROOT, dir, 'tsconfig.json');
        const covered =
            excluded.has(projectName(dir)) || !fs.existsSync(rootConfig) ? new Set() : coveredFiles(ts, rootConfig);
        const uncovered = tests.filter(file => !covered.has(path.join(ROOT, file))).length;
        if (uncovered) result[dir] = 1;
    }
    return result;
};

module.exports = { BASELINE_FILE, coveredFiles, measure };
