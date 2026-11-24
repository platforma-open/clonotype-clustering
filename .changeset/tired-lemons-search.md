---
"@platforma-open/milaboratories.clonotype-clustering.software": minor
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering": minor
"@platforma-open/milaboratories.clonotype-clustering.model": minor
"@platforma-open/milaboratories.clonotype-clustering.ui": minor
---

For peptide inputs, the residue logo now shows letter heights in bits: conserved positions stand tall, variable ones low.

- The logo column is now "Residue logo height (bits)" and replaces "Residue frequency", so a saved logo graph needs it picked again as Y. Turn on Normalize in the logo to see each position's shares, as before.
- The logo follows the centroid: positions the centroid leaves out by Gap Threshold are left out of the logo too, so each logo position matches a centroid letter.
- Clusters with more than 1,000 different sequences now use the most abundant ones for the centroid: up to 5,000 for amino acids, 1,000 for nucleotides.
- Updating re-runs the block, and centroids and logos in existing projects can change.
