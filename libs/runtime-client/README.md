# @chatic/runtime-client

**A re-export, kept until its consumers move.** The app API and the runtime declaration are folders of
[`@chatic/runtime`](../runtime/README.md) now: `src/api/` and `src/declare/`. This package is two lines,

```ts
export * from '@chatic/runtime/api';
export * from '@chatic/runtime/declare';
```

so `@chatic/runtime-web`, `@chatic/runtime-mobile` and `@chatic/runtime-react` import the same names as
before, and each name is the very value `@chatic/runtime` holds. It has no code, no tests and no docs of
its own; read [docs/api](../runtime/docs/api/README.md) and
[docs/declare](../runtime/docs/declare/README.md). Its tag is `layer:runtime`, like the package it
re-exports ([docs/layers](../runtime/docs/layers/README.md#between-packages)).

`@chatic/runtime-client/<path>`, which tests use to mock one file, maps to `libs/runtime/src/api/<path>`
in `tsconfig.base.json` and in the jest configs that name it.

Apps do not import it — the root lint refuses it. A new import of it is a wrong turn: import
`@chatic/runtime/api` or `@chatic/runtime/declare` instead.
