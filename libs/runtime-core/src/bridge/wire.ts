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

export type PromiseCrossing<Value> = [Value] extends [{ delivered: PromiseLike<unknown> }]
    ? [NotOnTheWire<Omit<Value, 'delivered'>>] extends [never]
        ? 'receipt'
        : `result does not cross the bridge — ${NotOnTheWire<Omit<Value, 'delivered'>> & string}`
    : [NotOnTheWire<Value>] extends [never]
      ? 'call'
      : `result does not cross the bridge — ${NotOnTheWire<Value> & string}`;

export type CheckedCrossing<Member, Crossing extends string> = Member extends (...args: never[]) => infer Result
    ? [NotOnTheWire<Awaited<Result>>] extends [never]
        ? Crossing
        : Exclude<Crossing, 'call'> | `result does not cross the bridge — ${NotOnTheWire<Awaited<Result>> & string}`
    : Crossing;
