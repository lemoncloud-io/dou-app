# chatic-apps-sdk documentation

The library's own reference — every call, its limits and its errors — is the package
[`README.md`](../README.md). This folder holds what is written around it.

## Tree rules

1. Every category folder has a `README.md` — either the category's lead document, or a short index.
2. A category name has to answer "does this document belong here?" on its own.
3. Depth stops at `docs/<category>/<topic>.md`.
4. No topic files directly under `docs/` — this file is the only top-level document.

## Categories

| Category                    | Answers                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [guide/](./guide/README.md) | How to build a page with the library: the toolchain, the project, the bundle that comes out, and the rules for an AI assistant writing one |

Both documents in `guide/` are shipped in the published package, `README.md` beside them as
`GUIDE.md` and `agent-rules.md` as `AGENTS.md`, so a developer finds them in
`node_modules/@lemoncloud/chatic-apps-sdk/`. An assistant reads an `AGENTS.md` at the top of a project,
not one inside a dependency, so the guide tells the developer to copy it there. They link to nothing
outside this folder and name the package README in words.
