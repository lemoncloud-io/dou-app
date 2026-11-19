/**
 * The page's own `XMLHttpRequest` PUT. A browser tab sends every file with it; inside the app the
 * shell's transfer module hands it the files the shell does not move itself (the `files` port's shell
 * side, `src/config/adapters/files.ts`).
 *
 * Chosen here, in the declaration part, because the sender is a page adapter
 * (`@chatic/runtime-web`), which the rest of the app does not import.
 */
export { xhrPut as pageUploadPut } from '@chatic/runtime-web';
