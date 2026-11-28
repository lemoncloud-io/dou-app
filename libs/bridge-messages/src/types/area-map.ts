export type SharedKeys<T extends unknown[], Seen = never> = T extends [infer Head, ...infer Rest]
    ? (keyof Head & Seen) | SharedKeys<Rest, Seen | keyof Head>
    : never;

type IntersectAll<T extends unknown[]> = T extends [infer Head, ...infer Rest] ? Head & IntersectAll<Rest> : unknown;

export type JoinAreas<T extends unknown[], Shared extends never> = { [K in keyof IntersectAll<T>]: IntersectAll<T>[K] };
