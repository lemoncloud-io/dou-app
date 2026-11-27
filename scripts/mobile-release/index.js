#!/usr/bin/env node
const fs = require('fs');

const { checkStoreNotes } = require('./notes');

const USAGE = `Usage: yarn mobile:release <command>

  plan [--json] [--from <ref>] [--to <ref>] [--bump auto|major|minor|patch] [--version X.Y.Z]
       [--build N] [--store-build N] [--no-prs] [--out <file>]
  dev [all|ios|android] --notes "<store notes>" | --notes-file <file> [--team-notes-file <file>]
      [--bump auto|major|minor|patch] [--version X.Y.Z] [--build N] [--dry-run]
  dev [all|ios|android] --tag <mobile-v tag> [--dry-run]   upload the platforms that tag is missing
  prod                      not available yet
  finish <mobile-v tag> [--team-notes-file <file>]
  status
  check-notes <store-notes-file>
  ios-version --version X.Y.Z --build N

Read apps/mobile/docs/release/deploy.md for the release flow.`;

function checkNotes(file) {
    const result = checkStoreNotes(fs.readFileSync(file, 'utf8'));
    if (!result.ok) throw new Error(result.error);
    console.log(`store notes: ${result.length} characters`);
}

function flags(argv) {
    const options = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i].startsWith('--')) {
            options[argv[i].slice(2)] = argv[i + 1] === undefined ? '' : argv[i + 1];
            i += 1;
        } else options._.push(argv[i]);
    }
    return options;
}

function list(value) {
    return (value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function storeBuild(argv) {
    const store = require('./store');
    const options = flags(argv);
    const floor = store.storeFloor(list(options.platforms), options.env, store.defaultDeps);
    console.error(`store build numbers: ${store.formatResults(floor.byPlatform)}`);
    console.log(floor.max);
}

function retryInfo(argv) {
    const release = require('./release');
    const options = flags(argv);
    const target = release.retryTarget(options._[0], options.platform, release.defaultDeps);
    const { formatResults } = require('./store');
    console.log(
        JSON.stringify({
            tag: target.tag,
            version: target.version,
            build: target.build,
            sha: target.sha,
            missing: target.missing,
            results: formatResults(target.recorded.results),
            storeNotes: target.recorded.storeNotes,
        })
    );
}

function results(argv) {
    const store = require('./store');
    const options = flags(argv);
    const raw = Object.fromEntries(
        list(options.outcomes).map(item => {
            const [platform, outcome] = item.split('=').map(part => part.trim());
            return [platform, outcome];
        })
    );
    const resolved = store.resolveResults(
        { requested: list(options.requested), outcomes: raw, env: options.env, build: Number(options.build) },
        store.defaultDeps
    );
    const merged = options.previous ? store.mergeResults(store.parseResults(options.previous), resolved) : resolved;
    console.log(store.formatResults(merged));
}

async function run(argv) {
    const [command, ...rest] = argv;
    if (command === 'plan') return require('./plan').main(rest);
    if (['dev', 'prod', 'finish', 'status'].includes(command)) {
        const release = require('./release');
        return release.run(argv, release.defaultDeps);
    }
    if (command === 'ios-version') return require('./ios-version').main(rest);
    if (command === 'check-notes') return checkNotes(rest[0]);
    if (command === 'store-build') return storeBuild(rest);
    if (command === 'retry-info') return retryInfo(rest);
    if (command === 'results') return results(rest);
    console.log(USAGE);
    if (command && command !== 'help' && command !== '--help') process.exitCode = 1;
}

require('./io').runMain(module, run);

module.exports = { run, checkNotes, flags };
