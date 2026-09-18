#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG = {
    changelogPath: 'CHANGELOG.md',
    targetBranch: 'develop',
    rootPackagePath: 'package.json', // Path to the root package.json
    projectPaths: {
        web: 'apps/web/package.json',
        'admin-v2': 'apps/admin-v2/package.json',
        landing: 'apps/landing/package.json',
        'desktop-web': 'apps/desktop-web/package.json',
    },
    scopeMap: {
        web: 'web',
        // admin-v2 is the current admin app; 'admin'-scoped commits bump it.
        'admin-v2': 'admin',
        landing: 'landing',
        'desktop-web': 'desktop-web',
    },
};

// Defines the priority order of version bump types
const VERSION_PRIORITY = {
    major: 3,
    minor: 2,
    patch: 1,
    none: 0,
};

function getProjectsToProcess() {
    const targetProjects = process.argv.slice(2); // Get all arguments after script name

    // If no projects specified, return all projects
    if (targetProjects.length === 0) {
        return Object.keys(CONFIG.projectPaths);
    }

    // Validate all provided projects
    const invalidProjects = targetProjects.filter(p => !CONFIG.projectPaths[p]);
    if (invalidProjects.length > 0) {
        const validOptions = Object.keys(CONFIG.projectPaths).join(', ');
        console.error(`Error: Invalid project(s) "${invalidProjects.join(', ')}". Valid options are: ${validOptions}`);
        process.exit(1);
    }

    return targetProjects;
}

// Parses a single conventional commit line ("type(scope): message") → { type, scope, message } | null
const CONVENTIONAL_RE = /^([a-z]+)(?:\(([^)]+)\))?:\s*(.+)/i;

function parseConventionalSubject(subject) {
    const cleaned = subject.replace(/\s*\(#\d+\)$/, '').trim();
    const match = cleaned.match(CONVENTIONAL_RE);
    if (!match) return null;

    return {
        type: match[1].toLowerCase(),
        scope: match[2]?.toLowerCase() || '',
        message: match[3].trim(),
    };
}

function parseSquashMergeCommit(commitMessage) {
    const commits = [];
    const lines = commitMessage.trim().split('\n');

    // Process the PR title
    const firstLine = lines[0].replace(/\s*\(#\d+\)$/, '').trim();
    const title = parseConventionalSubject(firstLine);
    if (title) commits.push(title);

    // Process individual commits (* bullets)
    lines.forEach(line => {
        line = line.trim();
        if (!line.startsWith('*')) return;
        const bullet = parseConventionalSubject(line.substring(1).trim());
        if (bullet) commits.push(bullet);
    });

    // Handle the Feature/ format - only when there are no other commits
    if (commits.length === 0 && firstLine.toLowerCase().startsWith('feature/')) {
        commits.push({ type: 'feat', scope: '', message: firstLine.substring(8).trim() });
    }

    return commits;
}

function shouldUpdateProject(projectName, commits) {
    // If even one commit has no scope, update every project
    const hasGlobalCommit = commits.some(commit => !commit.scope);

    // Update if there's a commit whose scope matches this project
    const hasProjectScopedCommit = commits.some(commit => commit.scope === CONFIG.scopeMap[projectName]);

    return hasGlobalCommit || hasProjectScopedCommit;
}

function determineReleaseType(commits, projectName) {
    // Include every commit that either has no scope or matches this project's scope
    const relevantCommits = commits.filter(commit => !commit.scope || commit.scope === CONFIG.scopeMap[projectName]);

    let releaseType = 'patch';

    for (const commit of relevantCommits) {
        if (commit.type.endsWith('!') || commit.message.includes('BREAKING CHANGE')) {
            return 'major';
        }

        if (commit.type === 'feat') {
            releaseType = 'minor';
        }
    }

    return releaseType;
}

function categorizeCommits(commits) {
    const categories = {
        'Breaking Changes': [],
        Features: [],
        'Bug Fixes': [],
        Documentation: [],
        Refactor: [],
        Chores: [],
        Other: [],
    };

    // Process every commit, with no scope filtering
    commits.forEach(commit => {
        const { type, scope, message } = commit;
        const scopePrefix = scope ? `(${scope}) ` : '';

        switch (type) {
            case 'feat':
                if (message.includes('BREAKING CHANGE') || type.endsWith('!')) {
                    categories['Breaking Changes'].push(`${scopePrefix}${message}`);
                } else {
                    categories['Features'].push(`${scopePrefix}${message}`);
                }
                break;
            case 'fix':
                categories['Bug Fixes'].push(`${scopePrefix}${message}`);
                break;
            case 'docs':
                categories['Documentation'].push(`${scopePrefix}${message}`);
                break;
            case 'refactor':
                categories['Refactor'].push(`${scopePrefix}${message}`);
                break;
            case 'chore':
                categories['Chores'].push(`${scopePrefix}${message}`);
                break;
            default:
                categories['Other'].push(`${type}: ${scopePrefix}${message}`);
        }
    });

    // Drop empty categories
    Object.keys(categories).forEach(key => {
        if (categories[key].length === 0) {
            delete categories[key];
        }
    });

    return categories;
}

function generateChangelog(versionInfo, categories) {
    const date = new Date().toISOString().split('T')[0];
    let changelog = '';

    // Header including the version info and date
    changelog += `## [${date}] - ${versionInfo}\n\n`;

    Object.entries(categories).forEach(([category, messages]) => {
        if (messages.length > 0) {
            changelog += `### ${category}\n\n`;
            messages.forEach(msg => {
                changelog += `- ${msg}\n`;
            });
            changelog += '\n';
        }
    });

    return changelog;
}

function updateChangelog(newContent) {
    const changelogPath = path.resolve(process.cwd(), CONFIG.changelogPath);
    let existingContent = '';

    try {
        existingContent = fs.readFileSync(changelogPath, 'utf8');
    } catch (error) {
        existingContent = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
    }

    const [header, ...rest] = existingContent.split('\n\n');
    const updatedContent = `${header}\n\n${newContent}${rest.join('\n\n')}`;

    fs.writeFileSync(changelogPath, updatedContent);
}

function updatePackageVersion(projectPath, newVersion) {
    const packagePath = path.resolve(process.cwd(), projectPath);
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const oldVersion = packageJson.version;
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    return {
        name: packageJson.name,
        oldVersion,
        newVersion,
    };
}

function getSquashMergeCommitMessage() {
    const result = spawnSync('git', ['log', '-1', '--pretty=%B']);
    return result.stdout.toString().trim();
}

function getCommitParents() {
    const out = spawnSync('git', ['log', '-1', '--pretty=%P']).stdout.toString().trim();
    return out ? out.split(/\s+/) : [];
}

function getMergedCommitSubjects(firstParent) {
    const out = spawnSync('git', [
        'log',
        '--no-merges',
        '--pretty=format:%s',
        `${firstParent}..HEAD`,
    ]).stdout.toString();
    return out
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

// Collects the list of conventional commits regardless of how the merge was done.
// - Regular merge commit (2+ parents): the last commit is "Merge pull request ..." and won't
//   match, so each real commit's subject that the merge brought in (first-parent..HEAD) is
//   parsed individually.
// - Squash merge / single commit: parses the last commit message (title + * bullets).
function collectCommits() {
    const parents = getCommitParents();

    const commits =
        parents.length >= 2
            ? getMergedCommitSubjects(parents[0]).map(parseConventionalSubject).filter(Boolean)
            : parseSquashMergeCommit(getSquashMergeCommitMessage());

    console.log('Parsed commits:', JSON.stringify(commits, null, 2));
    return commits;
}

function incrementVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);

    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(`Invalid release type: ${type}`);
    }
}

function main() {
    try {
        const currentBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.toString().trim();

        if (currentBranch !== CONFIG.targetBranch) {
            console.log(`Skipping version update: Not on ${CONFIG.targetBranch} branch`);
            return;
        }

        const commits = collectCommits();

        if (commits.length === 0) {
            console.log('No conventional commits found in the squash merge message');
            return;
        }

        let updatedAnyProject = false;
        let updatedVersions = [];
        let highestReleaseType = 'none';

        const projectsToProcess = getProjectsToProcess();

        // 1. Update the version of the selected projects
        projectsToProcess.forEach(projectName => {
            const projectPath = CONFIG.projectPaths[projectName];
            const packageJson = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

            if (shouldUpdateProject(projectName, commits)) {
                updatedAnyProject = true;
                const releaseType = determineReleaseType(commits, projectName);

                // Track the highest version bump type seen
                if (VERSION_PRIORITY[releaseType] > VERSION_PRIORITY[highestReleaseType]) {
                    highestReleaseType = releaseType;
                }

                const newVersion = incrementVersion(packageJson.version, releaseType);
                const { name, oldVersion } = updatePackageVersion(projectPath, newVersion);
                updatedVersions.push({ name, version: newVersion });

                console.log(`Updated ${name} from ${oldVersion} to ${newVersion}`);
            } else {
                console.log(`Skipping version update for ${projectName}: No relevant changes`);
            }
        });

        // 2. Update the root package.json
        if (highestReleaseType !== 'none') {
            const rootPackage = JSON.parse(fs.readFileSync(CONFIG.rootPackagePath, 'utf8'));
            const newRootVersion = incrementVersion(rootPackage.version, highestReleaseType);
            const { name, oldVersion } = updatePackageVersion(CONFIG.rootPackagePath, newRootVersion);
            updatedVersions.unshift({ name: 'root', version: newRootVersion });

            console.log(`Updated root package from ${oldVersion} to ${newRootVersion}`);
        }

        // 3. Generate the CHANGELOG
        if (commits.length > 0) {
            const categories = categorizeCommits(commits);

            let versionInfo = '';
            if (updatedVersions.length > 0) {
                versionInfo = updatedVersions.map(({ name, version }) => `${name}@${version}`).join(', ');
            } else {
                versionInfo = 'No version updates';
            }

            const changelogContent = generateChangelog(versionInfo, categories);
            updateChangelog(changelogContent);
            console.log('Successfully updated CHANGELOG');
        }

        if (!updatedAnyProject) {
            console.log('No projects were updated as no commits had matching scopes');
        }
    } catch (error) {
        console.error('Error occurred:', error);
        process.exit(1);
    }
}

// Note: Argument validation is handled in getProjectsToProcess()
// This script now supports multiple projects:
//   node version-update.js              # Update all projects
//   node version-update.js web          # Update web only
//   node version-update.js web admin    # Update web and admin

main();
