'use strict';

/**
 * The workspace's own ESLint rules. `@nx/eslint-plugin` loads this folder by convention and offers
 * each rule as `@nx/workspace-<name>`, so the root config turns them on without registering a
 * plugin. Nx also lists this folder among every project's lint inputs, which is why rules that more
 * than one project uses live here: changing one re-lints everything instead of serving a stale cache.
 */
module.exports = {
    rules: {
        'runtime-wiring-call': require('./runtime-wiring-call'),
    },
};
