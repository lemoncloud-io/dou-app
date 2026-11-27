# vectors

A contract vector is the output of the TS code for fixed inputs: a signature, a socket packet or an HTTP request. The TS script `vectors/generate.ts` writes them to `vectors/*.json`, and each Rust crate tests that it produces the same bytes. `nx run desktop-native:vectors-check` regenerates them and fails when a committed file differs, so a change to the TS formula cannot pass unnoticed.

A scenario is a domain case (unread counts, ordering, outbox, sync) written as inputs and the expected state, taken from the TS tests and replayed against the Rust engine as a black box.
