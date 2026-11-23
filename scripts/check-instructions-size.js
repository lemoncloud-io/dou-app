#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUDGET_FILE = path.join(__dirname, 'instructions-size-budget.json');
const SKILLS_DIR = 'docs/config/skills';
const SKILL_TOTAL = 'skills total';

const bodyLines = text => {
    const lines = text.replace(/\n$/, '').split('\n');
    if (lines[0] !== '---') return lines.length;
    const end = lines.indexOf('---', 1);
    return end === -1 ? lines.length : lines.length - end - 1;
};

const measure = root => {
    const sizes = { 'AGENTS.md': bodyLines(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')) };
    const skillsDir = path.join(root, SKILLS_DIR);
    const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).sort() : [];
    let total = 0;
    for (const name of skills) {
        const file = path.join(skillsDir, name, 'SKILL.md');
        if (!fs.existsSync(file)) continue;
        const lines = bodyLines(fs.readFileSync(file, 'utf8'));
        sizes[`${SKILLS_DIR}/${name}/SKILL.md`] = lines;
        total += lines;
    }
    sizes[SKILL_TOTAL] = total;
    return sizes;
};

const check = (sizes, budget) => {
    const problems = [];
    for (const [file, lines] of Object.entries(sizes)) {
        if (!(file in budget)) {
            problems.push(`${file}: ${lines} lines and no budget. Add it to scripts/instructions-size-budget.json.`);
        } else if (lines > budget[file]) {
            problems.push(`${file}: ${lines} lines, budget ${budget[file]}. Cut it, or move detail into references/.`);
        }
    }
    for (const file of Object.keys(budget)) {
        if (!(file in sizes)) problems.push(`${file}: in the budget but gone. Remove its entry.`);
    }
    return problems;
};

const lowered = (sizes, budget) =>
    Object.fromEntries(
        Object.entries(budget).map(([file, max]) => [file, file in sizes ? Math.min(max, sizes[file]) : max])
    );

const run = (argv, root = ROOT, budgetFile = BUDGET_FILE) => {
    const sizes = measure(root);
    const budget = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
    if (argv.includes('--report')) {
        for (const [file, lines] of Object.entries(sizes)) {
            console.log(`${String(lines).padStart(4)} / ${budget[file] ?? '-'}  ${file}`);
        }
        return 0;
    }
    if (argv.includes('--update')) {
        fs.writeFileSync(budgetFile, `${JSON.stringify(lowered(sizes, budget), null, 4)}\n`);
        return 0;
    }
    const problems = check(sizes, budget);
    if (problems.length) {
        console.error(`${problems.join('\n')}\n\nInstruction size budget exceeded.`);
        return 1;
    }
    const slack = Object.entries(sizes).filter(([file, lines]) => budget[file] - lines >= 5);
    if (slack.length) {
        console.log(`Under budget by 5+ lines: ${slack.map(([f]) => f).join(', ')}. Lower it with --update.`);
    }
    return 0;
};

if (require.main === module) process.exit(run(process.argv.slice(2)));

module.exports = { bodyLines, measure, check, lowered, run };
