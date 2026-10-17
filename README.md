# bend-prof

Where does `bend <file> --check-only` spend its time? `bend-prof` loads a file
the way the CLI does, checks it one top-level entry at a time, and prints the
slowest entries with their file and line.

```
BEND_SRC=<bendlang/bend checkout> bun prof.ts <file.bend> [top=15]
```

```
proofs/crypto/aes/inverse.bend: 583 entries, load 50 ms, check 4321 ms
      ms      %  def
  4167.1  96.4%  inverse_unit_bits (proof)  proofs/crypto/aes/inverse.bend:12
    17.8   0.4%  inverse_zero (proof)  proofs/crypto/aes/inverse.bend:573
     7.9   0.2%  F32.mul  ../bend/bend2/base.bend:1656
by module: (this file and Base) 4297 ms, spec/crypto/aes/aes 16 ms, ...
```

## How it works

`book_valid(book, done)` treats the first `done` entries of `book.order` as
already validated. bend-prof cuts the order after entry `i` and calls
`book_valid(book, i)`, so each call checks exactly one entry against the
entries before it, on the same book. Checked bodies and template instances
stay in the book, so the per-entry times add up to an ordinary check. Each
call has a small fixed cost, so the total runs high on files with many
small entries: 4.3 s against 4.3 s for a plain `--check-only` on
`aes/inverse.bend` (583 entries), but 1.3 s against 1.0 s on a
`dynamic_array` proof (1,851 entries). The ranking of slow entries is what
to read; startup and loading are reported separately.

A `law` is in the order twice: its statement, then its proof. At the
statement's position bend-prof hides the body, as the full check does, so a
proof is timed once, at the point where it is checked. Rows are labelled
`(statement)` or `(proof)`.

Imports are grouped by module, so `by module` shows which library a slow
check comes from.

## Limits

- It imports `bend2/bend.ts` from a source checkout (`BEND_SRC`): the
  installed CLI has no importable checker.
- It times checking only, not `--verdict` (the Lean kernel) and not running.
- It stops at the first failing entry and prints that entry's error.
- It uses `bend.ts` internals (`book_load`, `book_valid`, `book.order`,
  `book.tlds`), tested against bendlang/bend `main` at e5527d5. A change
  to those can break it.

Licensed under Apache-2.0, like Bend.

Found and tested with Claude Code, running Claude Opus 5.5, during an audit of
`--verdict`.
