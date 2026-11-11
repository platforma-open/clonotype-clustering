import type { Clonotype } from "./helpers";

/**
 * Three CDR3 families, each within two mismatches of its members (identity ≥ 0.8 over
 * 10 to 12 residues) and far from the other two. Every mismatch sits inside the sequence:
 * mmseqs2 aligns locally, so a terminal mismatch is simply trimmed off and the pair reads
 * as identical over the aligned part, whatever the identity threshold.
 *
 * Family B is built so the two residue weightings disagree at one column: position 10 is
 * F in c04 alone (200 cells) and Y in c05 and c06 (90 cells together). Equal weight gives
 * Y (2 of 3 members); abundance weight gives F (200 of 290 cells). Family C splits 1:1 at
 * position 6 (N 30 cells, Y 10 cells), so equal weight yields X there at any threshold
 * above 0.5 while abundance weight commits to N.
 */
export const THREE_FAMILIES: Clonotype[] = [
  { key: "c01", seq: "CARDYWGQGTLV", count: 120 },
  { key: "c02", seq: "CARDYWGQGSLV", count: 80 },
  { key: "c03", seq: "CARDYFGQGTLV", count: 60 },
  { key: "c04", seq: "CASSLGTEAFF", count: 200 },
  { key: "c05", seq: "CASSLGTEAYF", count: 50 },
  { key: "c06", seq: "CASSPGTEAYF", count: 40 },
  { key: "c07", seq: "CTRGGNWFDP", count: 30 },
  { key: "c08", seq: "CTRGGYWFDP", count: 10 },
];

export const FAMILY_A = ["c01", "c02", "c03"];
export const FAMILY_B = ["c04", "c05", "c06"];
export const FAMILY_C = ["c07", "c08"];
export const THREE_FAMILY_PARTITION = [FAMILY_A, FAMILY_B, FAMILY_C];

/**
 * CDR3-length sequences need the high-precision mmseqs2 settings: at the defaults the k-mer
 * prefilter misses neighbours two mismatches apart in a 12-residue sequence, and the
 * families above split. The block exposes this as `highPrecision` ("suitable for short
 * sequences like CDR3"); every fixture run that expects the families to form uses it.
 */
export const SHORT_CDR3 = { highPrecision: true } as const;

// A fixed-length (9-mer) peptide library: two families, one mismatch apart. Family 2 splits
// 1:1 at position 8 (T 40 cells, S 10 cells), so its equal-weight centroid carries an X there.
export const PEPTIDES: Clonotype[] = [
  { key: "p1", seq: "SIINFEKLA", count: 50 },
  { key: "p2", seq: "SIINFEKLV", count: 30 },
  { key: "p3", seq: "SIINYEKLA", count: 20 },
  { key: "p4", seq: "GILGFVFTL", count: 40 },
  { key: "p5", seq: "GILGFVFSL", count: 10 },
];
