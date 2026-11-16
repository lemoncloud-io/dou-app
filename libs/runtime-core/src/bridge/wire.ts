/**
 * Where a value would not survive the bridge — as the path to each part that would not, or `never` when
 * all of it would.
 *
 * What crosses is JSON. A function is dropped; a promise, a `Map` or a `Set` arrives as `{}`, and a
 * page reading it as what its type says throws (`receipt.delivered.catch is not a function`) or, worse,
 * reads an empty object as an answer. The compiler checks every result the contract lets cross against
 * this, so a method whose result grows such a part stops compiling instead of breaking only on a launch
 * whose shell owns the session.
 *
 * Not reported, on purpose:
 * - a `Date`, which arrives as its ISO string — what the contract says a page gets;
 * - `any`, which says nothing about what it holds;
 * - a branded primitive (`string & { __brand }`), which is still a string on the wire.
 *
 * It looks five levels deep, which covers every domain row the repositories answer with; past that it
 * assumes the value crosses.
 */
export type NotOnTheWire<T, Depth extends unknown[] = []> = 0 extends 1 & T
    ? never
    : T extends string | number | boolean | null | undefined
      ? never
      : Depth['length'] extends 5
        ? never
        : T extends (...args: never[]) => unknown
          ? 'a function'
          : T extends PromiseLike<unknown>
            ? 'a promise'
            : T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
              ? 'a Map or Set'
              : T extends Date
                ? never
                : T extends readonly (infer Item)[]
                  ? NotOnTheWire<Item, [...Depth, 0]>
                  : T extends object
                    ? {
                          [K in keyof T]-?: NotOnTheWire<T[K], [...Depth, 0]> extends infer Part
                              ? [Part] extends [never]
                                  ? never
                                  : `${K & string}: ${Part & string}`
                              : never;
                      }[keyof T]
                    : never;

/**
 * How a repository method whose promise resolves with `Value` crosses: `receipt` for a write receipt
 * (`{ delivered: Promise }`, the rest JSON), `call` for a value that is all JSON, and otherwise a type
 * that names what does not cross — so a table entry for it fails to compile with the reason.
 *
 * `Value` is judged whole, never member by member: `Foo | null` is a `call` only if `Foo` crosses too,
 * and a receipt that may be `null` is not a receipt the page can rebuild — the in-process caller would
 * get `null`, the mirror an object.
 */
export type PromiseCrossing<Value> = [Value] extends [{ delivered: PromiseLike<unknown> }]
    ? [NotOnTheWire<Omit<Value, 'delivered'>>] extends [never]
        ? 'receipt'
        : `result does not cross the bridge — ${NotOnTheWire<Omit<Value, 'delivered'>> & string}`
    : [NotOnTheWire<Value>] extends [never]
      ? 'call'
      : `result does not cross the bridge — ${NotOnTheWire<Value> & string}`;

/**
 * The crossing a contract table lists a member with, checked: `Crossing` itself when the member's
 * result crosses, and otherwise every crossing but `call`, plus a type that names what does not cross —
 * so a `call` entry for such a member fails to compile with the reason in the message.
 */
export type CheckedCrossing<Member, Crossing extends string> = Member extends (...args: never[]) => infer Result
    ? [NotOnTheWire<Awaited<Result>>] extends [never]
        ? Crossing
        : Exclude<Crossing, 'call'> | `result does not cross the bridge — ${NotOnTheWire<Awaited<Result>> & string}`
    : Crossing;
