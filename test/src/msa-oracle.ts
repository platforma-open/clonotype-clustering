/*
  Shared TS oracle for the consensus helpers in software/src/process_results.py.

  Lives in its own module (rather than inline in a test) for two reasons:
   - wf.test.ts asserts algorithm semantics against it;
   - consensus-parity.test.ts asserts it against the REAL Python, so the mirror
     cannot silently drift from the implementation it claims to mirror.
*/

export const DEFAULT_GAP_THRESHOLD = 0.5; // must match process_results.py --gap-threshold default
export const AUTO_UNIFORM_LENGTH_SHARE = 0.9; // must match process_results.py

/**
 * Mirror of `_modal_length_share`: the share of non-empty sequences sitting at the single
 * most common length. Empty strings are excluded — a member missing this chain says
 * nothing about the library's length design. Returns 0 when nothing is left to measure.
 */
export function modalLengthShare(values: string[]): number {
  const lengths = values.map((v) => v.length).filter((l) => l > 0);
  if (lengths.length === 0) return 0;
  const histogram = new Map<number, number>();
  for (const l of lengths) histogram.set(l, (histogram.get(l) ?? 0) + 1);
  return Math.max(...histogram.values()) / lengths.length;
}

/**
 * Mirror of `_choose_alignment_model`: the whole `--alignment-model auto` rule.
 * Ungapped needs both a peptide library (VDJ junctions carry real indels) and every
 * chain's lengths dominated by one value; anything else, empty evidence included, is
 * gapped. Deliberately not evidence: how far the gapped MSA widened past the input,
 * which measurement shows scales with cluster size rather than with real indels.
 */
export function chooseAlignmentModel(
  modalShares: number[],
  peptideInput: boolean,
): "gapped" | "ungapped" {
  if (!peptideInput || modalShares.length === 0) return "gapped";
  return Math.min(...modalShares) >= AUTO_UNIFORM_LENGTH_SHARE ? "ungapped" : "gapped";
}

/**
 * Mirror of `_is_absent_column`. The position is absent when the weighted gap
 * fraction EXCEEDS `gapThreshold` — HMMER `hmmbuild --symfrac` stated in gap terms
 * (gapThreshold = 1 - symfrac), same 0.5 default.
 */
export function isAbsentColumn(tally: Map<string, number>, gapThreshold: number): boolean {
  const total = [...tally.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return true;
  // Strict, so both endpoints stay meaningful: 1.0 keeps every column holding a
  // residue, 0.0 marks any column containing a gap absent. A non-strict comparison
  // would make 0.0 mark EVERY column absent and empty the centroid.
  return (tally.get("-") ?? 0) / total > gapThreshold;
}

/**
 * Mirror of `_msa_consensus` (§1). `aligned` rows are equal-length, gap = "-".
 * Every column yields exactly one symbol, so the result is in alignment coordinates
 * and its length is the alignment width — columns are never dropped:
 *   "-"  the position is absent from most members (see isAbsentColumn),
 *   "X"  the position exists but no residue reaches `threshold`,
 *   else the winning residue (tie-break: lexically smaller letter).
 * `threshold` is measured against the NON-GAP weight only, so gaps are not charged
 * twice after already deciding whether the position exists. `removeGaps` strips "-"
 * as an explicit final step and affects nothing else.
 */
export function msaConsensus(
  aligned: string[],
  weights: number[],
  threshold: number,
  gapThreshold: number = DEFAULT_GAP_THRESHOLD,
  removeGaps: boolean = false,
): string {
  const out: string[] = [];
  const nCols = aligned[0].length;
  for (let col = 0; col < nCols; col++) {
    const tally = new Map<string, number>();
    aligned.forEach((row, i) => tally.set(row[col], (tally.get(row[col]) ?? 0) + weights[i]));
    if (isAbsentColumn(tally, gapThreshold)) {
      out.push("-");
      continue;
    }
    // Greatest non-gap weight; ties go to the lexically smaller letter, as in Python.
    let best = "";
    let bestKey: [number, number] = [-Infinity, -Infinity];
    let nonGapTotal = 0;
    for (const [a, w] of tally) {
      if (a === "-") continue;
      nonGapTotal += w;
      const key: [number, number] = [w, -a.charCodeAt(0)];
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        best = a;
        bestKey = key;
      }
    }
    if (nonGapTotal <= 0) {
      out.push("-");
      continue;
    }
    out.push(tally.get(best)! / nonGapTotal >= threshold ? best : "X");
  }
  const consensus = out.join("");
  return removeGaps ? consensus.replaceAll("-", "") : consensus;
}

/**
 * Mirror of `_ungapped_layout`. No internal gaps — only terminal offsets, the model
 * FaSTPACE uses for peptides and MEME for motifs. Equal-length members stack at offset
 * 0, which for Hamming distance makes the per-column mode the optimal median string.
 * Otherwise each member takes the terminal offset best matching the profile of the
 * members placed before it, greedily, in the given (deterministic) order.
 */
export function ungappedLayout(seqs: string[], weights: number[]): string[] {
  const width = Math.max(...seqs.map((s) => s.length));
  if (Math.min(...seqs.map((s) => s.length)) === width) return [...seqs];

  const counts: Map<string, number>[] = Array.from({ length: width }, () => new Map());
  const placed: string[] = [];
  seqs.forEach((seq, index) => {
    const span = width - seq.length;
    let bestOffset = 0;
    let bestScore: number | undefined;
    for (let offset = 0; offset <= span; offset++) {
      let score = 0;
      for (let i = 0; i < seq.length; i++) score += counts[offset + i].get(seq[i]) ?? 0;
      // Strict >, so ties keep the smallest offset and the layout stays deterministic.
      if (bestScore === undefined || score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }
    placed.push("-".repeat(bestOffset) + seq + "-".repeat(span - bestOffset));
    for (let i = 0; i < seq.length; i++) {
      const column = counts[bestOffset + i];
      column.set(seq[i], (column.get(seq[i]) ?? 0) + weights[index]);
    }
  });
  return placed;
}
