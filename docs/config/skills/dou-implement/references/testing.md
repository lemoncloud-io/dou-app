# Writing and running unit tests

Cover new and changed logic in this repo's conventions, then actually run it and confirm
it passes.

## Framework and placement

- **Jest.** The test sits beside the file it covers as `*.test.ts` (`Foo.ts` →
  `Foo.test.ts`).
- Do not bring in another framework or runner. Follow what is already here.

## Conventions, taken from neighbouring tests

- Group with `describe('<subject>', () => { ... })` and write each case as
  `it('<what it guarantees>', ...)`. Names are in English, like everything else written
  into this repo — see `AGENTS.md` § Language.
- Mock dependencies through a factory helper. Use `jest.fn()` and set return values per
  case with `.mockResolvedValue(...)` / `.mockReturnValue(...)`.

```ts
const createRemoteDataSource = () => ({
    getCloud: jest.fn(),
    updateCloud: jest.fn(),
});
```

- Arrange → Act → Assert, in that order. Leave a comment on setup that is not obvious.
- Assert values with `expect(...).toEqual(...)` and effects with
  `expect(mock).toHaveBeenCalledWith(...)`. Reach for
  `expect.objectContaining(...)` / `expect.anything()` for partial matches.

## What to cover

For each unit of changed logic:

1. **The happy path** — a representative input produces the expected result or effect.
2. **A meaningful edge** — empty, null, a cache miss, a boundary: whichever branch this
   logic actually has.
3. **Error handling**, where a failure path exists. Do not invent one that does not.

Verify behaviour, not implementation. "This input produces this result / delegates to
this collaborator this way", not "it called that private method internally".

## Proving the test earns its place

A test written against a bug has to fail without the fix. Revert the fix, run it, watch
it fail, restore the fix, and report that you did. A test that passes either way is
documentation, not a guard.

## Running them (not optional)

Writing them is not finishing. Run them, confirm they pass, and record the command and
result in the verification checklist.

- One file: `npx jest <path/to/Foo.test.ts>`
- By name: `npx jest -t '<part of the it text>'`
- Where the project runs tests through Nx, follow that: `npx nx test <project>`

Record exactly what was run. On failure, report the output rather than hiding it, then
fix it.
