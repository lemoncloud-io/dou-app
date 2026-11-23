function code(text) {
    const clean = String(text)
        .replace(/`/g, "'")
        .replace(/\|/g, '\\|')
        .replace(/@/g, '@\u200b')
        .replace(/[\r\n]+/g, ' ');
    return `\`${clean}\``;
}

module.exports = { code };
