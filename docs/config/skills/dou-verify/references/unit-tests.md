# Unit tests for new logic

- Jest, beside the file it covers (`Foo.ts` → `Foo.test.ts`). Add to an existing test file in its style and
  reuse its mock helpers. No new framework.
- Every piece of logic added or changed gets a case: a branch, a calculation, a state transition, error
  handling. Happy path plus the edge that logic actually has (empty, null, cache miss, boundary).
- Test behaviour, not implementation: "this input gives this result" or "this collaborator is called this
  way", never "this private method ran".
- Names are English sentences saying what is guaranteed: `it('keeps the last read position when the feed reloads')`.
- A test for a bug fails without the fix. Revert the fix, run it, watch it fail, restore it.
- Run it: `npx jest <path>` or `npx nx test <project>`, and put the command and result in the report.
- State-transition logic with many inputs is better served by a property test: [`dou-property`](../../dou-property/SKILL.md).
