---
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
---

Namespace the cluster axis and clustering columns by a content hash instead of the per-block blockId. The `pl7.app/clustering/blockId` domain on the `pl7.app/clusterId` axis (and on the distanceToCentroid column) is replaced with `pl7.app/clustering/contentHash`, derived from the resolved input columns' content ids plus the clustering parameters. Identical clustering runs across blocks/projects now produce content-identical columns that dedupe downstream (including the Parquet imports keyed on the cluster axis) instead of being made unique per block; different inputs/params stay distinct. The clustering computation itself already deduped; this extends dedup to the imported pframes.
