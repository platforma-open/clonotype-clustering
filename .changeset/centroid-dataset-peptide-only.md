---
"@platforma-open/milaboratories.clonotype-clustering": patch
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
---

The **Generate centroid dataset** feature is now restricted to peptide inputs:

- The exported centroid dataset is produced only when the input is a peptide dataset (axis `pl7.app/variantKey`); it is skipped for antibody/TCR (VDJ) inputs even if the box was checked.
- The **Generate centroid dataset** checkbox is hidden unless the input modality is peptide.
- The exported dataset is keyed on the standard peptide clonotype axis `pl7.app/variantKey` (inheriting the parent dataset's domain, including `pl7.app/peptide/extractionRunId`) and separated from the parent by the clustering content tag already on the cluster axis. Downstream peptide blocks (sequence-properties, antibody-sequence-liabilities, antibody-tcr-lead-selection) therefore detect it as a peptide dataset by axis name with no special-casing — no dedicated centroid axis is introduced.
- The exported dataset now mirrors a real peptide dataset's shape (a `pl7.app/variantKey` axis plus a `Peptide Id` label column) so downstream blocks treat it identically to a selected dataset.
