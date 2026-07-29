---
"@platforma-open/milaboratories.clonotype-clustering.software": minor
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering.model": minor
"@platforma-open/milaboratories.clonotype-clustering.ui": minor
---

Make gap handling in the centroid consensus explicit

The consensus centroid previously discarded an alignment column whenever gaps
outweighed every individual residue. That was not a threshold: on a diverse
column where each residue appears once, two gaps out of six already won, so a
position present in 67% of members vanished from the centroid — silently, and
with the real residues in that column. It also left `X` meaning two unrelated
things ("residues disagree" and "most members lack this position"), and made the
centroid length an unpredictable `alignment width − discarded columns`.

The consensus now emits exactly one symbol per alignment column, the same
contract as EMBOSS `cons`, Jalview's consensus row and MiXCR's contigs:

- `-` the position is absent from most members,
- `X` the position exists but no residue is confident enough,
- otherwise the winning residue.

Two new settings:

- **Gap Threshold** (default 0.5) — the weighted gap fraction a position must
  *exceed* to count as absent. Mirrors HMMER `hmmbuild --symfrac` stated in gap
  terms (`gapThreshold = 1 - symfrac`), same default. The comparison is strict, so
  both endpoints stay usable: 1.0 keeps every column holding a residue, 0.0 treats
  any column containing a gap as absent. Separate from Consensus Threshold, which
  decides *which* residue a position that does exist carries.
- **Remove gaps from centroid sequences** (default on) — strips `-` as an explicit
  final step, so the exported dataset stays a valid residue string. Turn it off to
  see where positions were dropped; the length is then the alignment width.

The residue vote is now taken over the non-gap weight only. Gaps already decide
whether the position exists, so charging them again flooded gappy-but-real columns
with `X`. `Consensus Centroid length` is visible by default, making a divergence
from `Reference Centroid` apparent instead of something to spot by eye.

Centroid sequences, and therefore the `PC-XXXXX` ids derived from them, change for
existing projects.

Exporting the consensus dataset now requires gap removal to be on, and is rejected
otherwise: the dataset carries sequence columns, so `-` would be misread downstream
and would inflate the accompanying sequence length. The checkbox is disabled while
gaps are kept rather than exporting something different from what the table shows.
