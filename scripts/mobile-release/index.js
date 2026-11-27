#!/usr/bin/env node
const fs = require('fs');

const { checkStoreNotes } = require('./notes');

const USAGE = `Usage: yarn mobile:release <command>

  plan [--json] [--from <ref>] [--to <ref>] [--bump auto|major|minor|patch] [--version X.Y.Z] [--no-prs] [--out <file>]
  dev [all|ios|android] --notes "<store notes>" | --notes-file <file> [--team-notes-file <file>]
      [--bump auto|major|minor|patch] [--version X.Y.Z] [--dry-run]
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

async function run(argv) {
    const [command, ...rest] = argv;
    if (command === 'plan') return require('./plan').main(rest);
    if (['dev', 'prod', 'finish', 'status'].includes(command)) {
        const release = require('./release');
        return release.run(argv, release.defaultDeps);
    }
    if (command === 'ios-version') return require('./ios-version').main(rest);
    if (command === 'check-notes') return checkNotes(rest[0]);
    console.log(USAGE);
    if (command && command !== 'help' && command !== '--help') process.exitCode = 1;
}

require('./io').runMain(module, run);

module.exports = { run, checkNotes };
