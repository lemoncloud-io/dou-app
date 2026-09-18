#!/usr/bin/env node
/**
 * Fail on a markdown link that points at nothing, and on an ADR link whose
 * label and target disagree about which decision it is.
 *
 * Why this exists as its own gate: nothing else in the repo reads a link.
 * Lint sees source files, typecheck sees types, and tests see behaviour — a
 * document that points at a file deleted three refactors ago passes all three.
 * The cost showed up when `docs/adr/` was renumbered: 17 files took new numbers,
 * the commit moved the files and updated nothing that pointed at them, and 65
 * links went dead in one step. Half of those were ADR-to-ADR, which is the worse
 * half — a number that has been reused does not 404, it quietly resolves to an
 * unrelated decision.
 *
 * Hence the second rule. A link written `[ADR-0089](./0033-relay-dm-invite.md)`
 * is the exact shape a renumber leaves behind, and it is mechanically decidable:
 * the label names a number, the path names a number, and they have to match.
 * Bare `ADR-0089` prose mentions carry no target, so nothing here can check
 * them — repointing those is a reading job, which is why the renumber is the
 * moment to do it and not later.
 *
 * A `path.ts:42` suffix is a deliberate convention in this repo (it opens the
 * file at the line in an editor), so the line part is stripped before the file
 * is looked up.
 *
 * Usage:
 *   node scripts/check-doc-links.js           # every tracked markdown file
 *   node scripts/check-doc-links.js docs/adr  # only files under a path
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ADR_DIR = path.join(ROOT, 'docs', 'adr');

/** `[label](target)`, with the target stopping at the first whitespace or `)`. */
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
/** ```fenced blocks``` — an example link inside one is documentation, not a reference. */
const FENCE = /```[\s\S]*?```/g;
/**
 * A whole link inside one `code span` — it is being shown, not followed, and a document explaining
 * this gate has to be able to print the broken shape it rejects. The span has to open on the `[`,
 * so a backticked *label*, `` [`ADR-0089`](./0089-….md) ``, is still a link and still checked.
 */
const INLINE_LINK_SAMPLE = /`\[[^`\n]*\]\([^`\n)]*\)`/g;
const EXTERNAL = /^(https?:|mailto:|tel:|#|<)/;
/** A label naming one ADR, e.g. `ADR-0089` or `` `ADR-0089` ``. */
const ADR_LABEL = /^`?ADR-(\d{4})`?$/;

const trackedMarkdown = () =>
    execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

/**
 * The ADR number a resolved path names, or null when it is not an ADR file.
 *
 * Decided on the resolved location rather than the written one: a link from
 * inside `docs/adr` is a bare `./0089-….md` with no directory to recognise.
 */
const adrNumberOf = onDisk => {
    if (path.dirname(onDisk) !== ADR_DIR) return null;
    const match = /^(\d{4})-[a-z0-9-]+\.md$/.exec(path.basename(onDisk));
    return match ? match[1] : null;
};

/** `source` is injectable so the tests can state a document instead of writing one to disk. */
const checkFile = (file, contents = fs.readFileSync(path.join(ROOT, file), 'utf8')) => {
    const problems = [];
    const source = contents.replace(FENCE, '').replace(INLINE_LINK_SAMPLE, '');
    const dir = path.dirname(file);
    for (const [, label, target] of source.matchAll(LINK)) {
        if (EXTERNAL.test(target)) continue;
        const [filePart] = target.split('#');
        const onDisk = path.resolve(ROOT, dir, filePart.replace(/:\d+(-\d+)?$/, ''));
        if (!fs.existsSync(onDisk)) {
            problems.push(`dead link       [${label}](${target})`);
            continue;
        }
        const labelled = ADR_LABEL.exec(label.trim());
        if (!labelled) continue;
        const targeted = adrNumberOf(onDisk);
        if (targeted && targeted !== labelled[1]) {
            problems.push(
                `ADR mismatch    [${label}](${target}) — the label says ${labelled[1]}, the file is ${targeted}`
            );
        }
    }
    return problems;
};

const run = scope => {
    /** Every ADR link resolves inside `docs/adr`, so a missing directory means the caller is lost. */
    if (!fs.existsSync(ADR_DIR)) {
        console.error(`docs/adr not found under ${ROOT}`);
        return 2;
    }
    const files = trackedMarkdown().filter(file => scope.length === 0 || scope.some(prefix => file.startsWith(prefix)));
    let failures = 0;
    for (const file of files) {
        const problems = checkFile(file);
        if (problems.length === 0) continue;
        failures += problems.length;
        console.error(`\n${file}`);
        for (const problem of problems) console.error(`  ${problem}`);
    }
    if (failures > 0) {
        console.error(`\n${failures} broken reference(s) in ${files.length} markdown files.`);
        return 1;
    }
    console.log(`${files.length} markdown files checked, every link resolves.`);
    return 0;
};

if (require.main === module) {
    process.exit(run(process.argv.slice(2)));
}

module.exports = { checkFile, run };
