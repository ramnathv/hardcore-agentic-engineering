# Brief

Make `src/slugify.mjs` turn arbitrary titles into url-safe slugs so that the
named check (`node --test working/test/slugify.test.mjs` from the prove-it root)
passes.

The contract that decides "done" is `done/contract.yaml`. It was fixed before
you started. You may run self-checks; only `dr-gate` records completion.

Do not touch `test/`, anything under `control/`, or the contract. If you think
the tests are wrong, stop and ask.
