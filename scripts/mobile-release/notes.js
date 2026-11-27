const { CATEGORIES } = require('./commits');

const STORE_NOTES_LIMIT = 500;

function unquote(value) {
    const trimmed = value.trim();
    if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");
    if (/^".*"$/.test(trimmed)) return JSON.parse(trimmed);
    return trimmed;
}

function parseReplacers(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const start = lines.findIndex(line => /^replacers:\s*$/.test(line));
    if (start === -1) return [];
    const replacers = [];
    for (const line of lines.slice(start + 1)) {
        if (/^\S/.test(line)) break;
        const search = /^\s*-\s*search:\s*(.+)$/.exec(line);
        const replace = /^\s*replace:\s*(.+)$/.exec(line);
        if (search) replacers.push({ search: unquote(search[1]), replace: '' });
        else if (replace && replacers.length > 0) replacers[replacers.length - 1].replace = unquote(replace[1]);
    }
    return replacers;
}

function applyReplacers(text, replacers) {
    return replacers.reduce((current, { search, replace }) => {
        const regex = /^\/(.+)\/([gimsuy]*)$/.exec(search);
        if (regex) return current.replace(new RegExp(regex[1], regex[2]), replace);
        return current.split(search).join(replace);
    }, text);
}

const EMPTY = {
    en: 'No change reached the mobile binary.',
    ko: '모바일 바이너리에 들어간 변경이 없습니다.',
};

function teamNotes(prs, directCommits, replacers = [], language = 'en') {
    const sections = CATEGORIES.map(category => {
        const lines = [
            ...prs
                .filter(pr => pr.category === category.key)
                .sort((a, b) => a.number - b.number)
                .map(pr => `- ${pr.title} @${pr.author} (#${pr.number})`),
            ...directCommits
                .filter(commit => commit.category === category.key)
                .map(commit => `- ${commit.subject} (${commit.sha.slice(0, 7)})`),
        ];
        const title = language === 'ko' ? category.cardTitle : category.title;
        return lines.length > 0 ? `### ${title}\n\n${lines.join('\n')}` : null;
    }).filter(Boolean);
    if (sections.length === 0) return EMPTY[language];
    return applyReplacers(sections.join('\n\n'), replacers);
}

function checkStoreNotes(notes) {
    const text = (notes || '').trim();
    const length = [...text].length;
    if (length === 0) return { ok: false, length, error: 'store_notes is empty' };
    if (length > STORE_NOTES_LIMIT) {
        return { ok: false, length, error: `store_notes is ${length} characters; the limit is ${STORE_NOTES_LIMIT}` };
    }
    return { ok: true, length, error: null };
}

module.exports = { STORE_NOTES_LIMIT, parseReplacers, applyReplacers, teamNotes, checkStoreNotes };
