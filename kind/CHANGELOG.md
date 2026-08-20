# @platforma-open/milaboratories.clonotype-clustering.kind

## 1.1.0

### Minor Changes

- 9b0830f: Add the mandatory block kind and upgrade the SDK

  The block now declares a `kind/` package carrying its identity and its
  init-params contract — the fields a project template supplies to seed a new
  instance. The model consumes them in `init` and projects the same set back out
  via `templateParams`, so export and apply are inverses. The contract covers the
  input dataset, the picked sequence columns, every clustering and centroid
  setting, the per-process memory and CPU limits, and the block labels; the table
  grid state, the two graph states and the alignment model stay out of it, being
  what the user is looking at rather than the recipe a template reproduces.

  The SDK upgrade that comes with it clears `types` from the structurer-owned test
  tsconfig, so the Python parity test pulls the node typings in by reference
  instead.
