/**
 * How this app's uploads leave the page: the page's own `XMLHttpRequest` PUT, which the `files` port's
 * implementations (`adapters/files.ts`) hand on as `runtime.files.put`. The desktop shell takes no
 * transfer from the page, so the page sends every file itself, in the shell and in a browser tab alike.
 *
 * Chosen here, in the declaration part, because the sender is a page adapter
 * (`@chatic/runtime-web`), which screens do not import.
 */
export { xhrPut as pageUploadPut } from '@chatic/runtime-web';
