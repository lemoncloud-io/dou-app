# fast-check shapes

## A pure function

```ts
import fc from 'fast-check';

it('merging pages in any order yields the same sorted, unique list', () => {
    fc.assert(
        fc.property(fc.array(fc.array(fc.integer({ min: 1, max: 500 }))), pages => {
            const shuffled = [...pages].reverse();
            expect(mergePages(shuffled)).toEqual(mergePages(pages));
        })
    );
});
```

## A state machine

```ts
class Send implements fc.Command<Model, Real> {
    constructor(readonly text: string) {}
    check = () => true;
    run(model: Model, real: Real) {
        real.outbox.enqueue(this.text);
        model.pending.push(this.text);
    }
    toString = () => `send(${this.text})`;
}

fc.assert(
    fc.property(fc.commands([fc.string().map(t => new Send(t)), fc.constant(new Reconnect())]), cmds => {
        const setup = () => ({ model: { pending: [] }, real: createOutbox() });
        fc.modelRun(setup, cmds);
    })
);
```

## Settings

- `fc.assert(prop, { numRuns: 200 })` by default; raise it locally while hunting, not in CI.
- A failure prints the seed and path; rerun with `{ seed, path }` to reproduce.
- Async properties use `fc.asyncProperty` and `await fc.assert(...)`.
