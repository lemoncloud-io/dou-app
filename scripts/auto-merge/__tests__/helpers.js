function lineCount(text) {
    return text ? text.split('\n').filter(Boolean).length : 0;
}

function file(path, { status = 'M', before = '', after = '', additions, deletions, binary = false } = {}) {
    return {
        path,
        status,
        binary,
        additions: additions ?? (status === 'D' ? 0 : lineCount(after)),
        deletions: deletions ?? (status === 'A' ? 0 : lineCount(before)),
        before: () => (status === 'A' ? null : before),
        after: () => (status === 'D' ? null : after),
    };
}

const pr = (over = {}) => ({ labels: [], draft: false, isFork: false, baseRef: 'develop', ...over });
const fix = subject => ({ subject, parents: 1 });

module.exports = { file, pr, fix };
