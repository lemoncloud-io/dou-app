# @chatic/runtime-core

**A re-export, kept until its consumers move.** The runtime's assembly and the runtime across a bridge
are folders of [`@chatic/runtime`](../runtime/README.md) now: `src/engine/` and `src/remote/`. This
package is two lines,

```ts
export * from '@chatic/runtime/engine';
export * from '@chatic/runtime/remote';
```

so `@chatic/runtime-web`, `@chatic/runtime-mobile` and `@chatic/runtime-react` import the same names as
before, and each name is the very value `@chatic/runtime` holds. It has no code and no tests of its own,
and its `docs/` holds only a pointer page at each old category path that other docs still link to; read [docs/engine](../runtime/docs/engine/README.md) and
[docs/remote](../runtime/docs/remote/README.md). Its tag is `layer:runtime`, like the package it
re-exports ([docs/layers](../runtime/docs/layers/README.md#between-packages)).

`@chatic/runtime-core/<path>`, which tests use to mock one file, maps to `libs/runtime/src/engine/<path>`
in `tsconfig.base.json` and in the jest configs that name it.

Apps do not import it — the root lint refuses it. A new import of it is a wrong turn: import
`@chatic/runtime/engine` or `@chatic/runtime/remote` instead.
