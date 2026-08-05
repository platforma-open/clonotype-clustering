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

New settings:

- **Gap Threshold** (default 0.5, under Advanced Settings) — the weighted gap fraction a position must
  *exceed* to count as absent. Mirrors HMMER `hmmbuild --symfrac` stated in gap
  terms (`gapThreshold = 1 - symfrac`), same default. The comparison is strict, so
  both endpoints stay usable: 1.0 keeps every column holding a residue, 0.0 treats
  any column containing a gap as absent. Separate from Consensus Threshold, which
  decides *which* residue a position that does exist carries.

The residue vote is now taken over the non-gap weight only. Gaps already decide
whether the position exists, so charging them again flooded gappy-but-real columns
with `X`. `Consensus Centroid length` is visible by default, making a divergence
from `Reference Centroid` apparent instead of something to spot by eye.

Centroid sequences, and therefore the `PC-XXXXX` ids derived from them, change for
existing projects.

Centroid sequences are always emitted as plain residue strings: `-` is not a valid
residue for the exported dataset or for anything downstream of it. The alignment
coordinates remain inspectable in the MSA panel, which shows the real alignment rather
than a dashed string, and `Consensus Centroid length` surfaces any divergence from
`Reference Centroid`. `process_results.py` keeps a `--keep-gaps` flag for running the
script by hand; the block does not set it.

**Alignment Model** (default `Automatic`, under Advanced Settings) selects how a cluster's
members are laid out in columns before the vote. `Ungapped (fixed length)` forbids internal
gaps and allows only terminal offsets — the model FaSTPACE uses for peptides and MEME for
motifs, both on the grounds that gapped motifs cost exponential search and add noise.
On a library where every member has the same length each offset is 0, so the centroid
keeps the input length exactly, and the per-column mode is then provably the optimal
median string under Hamming distance: the distance sum decomposes per position, so no
window search or substring enumeration can improve on it. Mixed-length clusters, which
mmseqs can produce at coverage below 1, get terminal offsets chosen against the profile
of the heavier members.

The contrast on a poorly-conserved cluster of six 15-mers:

```
gapped     theoretical 'YSVI'            len=4    reference len=15
ungapped   theoretical 'XXVXXXXXXXXXXXX' len=15   reference len=15
```

Gapped collapses to four residues; ungapped keeps the length and reports the absent
consensus honestly as `X`.

`Automatic` picks `Ungapped` when the input is a peptide library **and** at least 90% of its
sequences sit at one single length — the case where a shared position number means the same
thing across members and indels cannot occur by design. Everything else, VDJ repertoires
included, gets `Gapped`, since junctional indels there are real. The resolved model and the
length distribution behind it are printed in the run log.

Deliberately not used as evidence: how far the gapped MSA widened past the input length. It
looks like the signal that separates "kalign inserted gaps because of real indels" from
"kalign inserted gaps because of substitution noise", and it is not — the artefact scales
with cluster size. On substitution-only libraries containing no indels at all:

```
      L    members  rate   mean excess  p90  max
     15          8  0.30          0.16    1    3
     15        128  0.30          2.68    6    8
      9        128  0.30          3.32    9   11
```

while libraries built from genuinely offset motifs widen by as little as +0..+2 at four
members. The ranges overlap, absolutely and relative to the sequence length alike, so no
per-cluster threshold separates them. The 90% length tolerance is calibrated instead: on
15-mers at a 0.15 substitution rate with a fraction of members carrying one deletion, the
mean edit distance from the centroid to the true parent goes

```
   off-modal members    0%     12%    25%    38%    50%
   gapped               0.27   0.29   0.36   0.47   0.46
   ungapped             0.26   0.44   0.86   1.58   2.72
```

so at the 12% the tolerance permits, ungapped costs ~0.15 of an edit; by 25% it has more
than doubled the error. For what it is worth, the two models agree outright on 93–100% of
equal-length substitution clusters across 4–128 members, so this setting rarely changes an
answer — it decides which model is used where it does.

`Gap Threshold` is no longer hidden for peptide inputs. It sits next to `Alignment Model`
under Advanced Settings, which is where it belonged: on a gapped layout of peptides it is
exactly what keeps a spurious gap column from shortening the centroid.

How the centroid was computed is now recorded in the **column domain**, not only in the
label, so a column produced under different settings is a different column: two blocks run
side by side to compare settings cannot be confused for each other, and a downstream
consumer of an exported sequence can still establish how it was derived.

```
pl7.app/clustering/centroidAlignment           gapped | ungapped
pl7.app/clustering/residueWeighting            equal | abundance
pl7.app/clustering/gapThresholdPercent         e.g. "50"
pl7.app/clustering/consensusThresholdPercent   e.g. "60"
```

Thresholds are integer percent rather than the raw float, because a domain value has to be
byte-stable for column identity to be stable and float formatting is not — `0.3` can render
as `0.30000000000000004`. The consensus threshold is scoped to the thresholded centroid
only: the medoid, the profile distance and radius, and the exported plurality centroid are
derived at threshold 0 or straight from the profile, so tagging them with it would fragment
their identity for a setting that cannot change their value.

`centroidAlignment` records the setting as chosen, so on the default it reads `auto` rather
than the model auto resolved to. Resolving it needs the sequences, which only
`process_results.py` sees — a workflow body cannot await column data — so the concrete value
does not exist at spec-building time. Identity stays sound anyway: the resolution is a
deterministic function of the input data, and the input data is already part of the column's
lineage, so two `auto` columns over the same input always agree.

The same facts appear in prose in each column's hover description, and the auto-generated
block label gains an `ungapped` suffix so two blocks compared side by side are
distinguishable at a glance.

This changes the identity of the centroid, distance and radius columns. Existing projects
recompute, and a downstream block matching those columns on their current spec will need to
pick them up again.
