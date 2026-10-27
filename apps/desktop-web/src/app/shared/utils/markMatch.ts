/**
 * Regex sources for the bold and italic marks: group 1 is the words inside. Shared by the message
 * renderer and the plain-text previews, so a preview drops exactly the markers the reader draws;
 * apps/web holds the same rule.
 *
 * Marks nest, because the composer's format buttons stack them: bold and italic together export as
 * `***x***`, and italic on part of a bold run as `**a *b* c**`. So a bold run may hold whole italic
 * runs and an italic run whole bold runs. Neither crosses a line break.
 */
export const BOLD_SOURCE = '\\*\\*((?:[^*\\n]|\\*[^*\\n]+\\*)+)\\*\\*';
export const ITALIC_SOURCE = '\\*((?:[^*\\n]|\\*\\*[^*\\n]+\\*\\*)+)\\*';
