import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { currentCoverage } from './coverage';

const OUTPUT = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'dist',
    '.playwright',
    'apps',
    'web-e2e',
    'feature-coverage.json'
);

const coverage = currentCoverage();
if (!coverage) {
    console.error('feature-coverage: feature-map.json or apps/web/src/app/features is missing');
    process.exit(1);
}

const width = Math.max(...coverage.features.map(row => row.name.length));
for (const row of coverage.features) {
    console.log(`${row.name.padEnd(width)}  ${row.specs.length ? row.specs.join(', ') : '— no scenario'}`);
}
console.log('');
console.log(
    `${coverage.features.length - coverage.uncovered.length}/${coverage.features.length} features have a scenario.` +
        (coverage.uncovered.length ? ` Without one (reported, not failed): ${coverage.uncovered.join(', ')}.` : '')
);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(coverage, null, 2)}\n`);
console.log(`Written to ${OUTPUT}`);

if (coverage.problems.length) {
    console.error('\nfeature-map.json has drifted from the trees:');
    for (const problem of coverage.problems) console.error(`  - ${problem}`);
    process.exit(1);
}
