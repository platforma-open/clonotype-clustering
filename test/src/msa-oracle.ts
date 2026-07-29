/*
  Shared TS oracle for the consensus helpers in software/src/process_results.py.

  Lives in its own module (rather than inline in a test) for two reasons:
   - wf.test.ts asserts algorithm semantics against it;
   - consensus-parity.test.ts asserts it against the REAL Python, so the mirror
     cannot silently drift from the implementation it claims to mirror.
*/

export const DEFAULT_GAP_THRESHOLD = 0.5; // must match process_results.py --gap-threshold default

/**
 * Mirror of `_is_absent_column`. The position is absent from the cluster when the
 * weighted gap fraction reaches `gapThreshold` — HMMER `hmmbuild --symfrac` stated
 * in gap terms, same 0.5 default.
 */
export function isAbsentColumn(tally: Map<string, number>, gapThreshold: number): boolean {
  const total = [...tally.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return true;
  return (tally.get("-") ?? 0) / total >= gapThreshold;
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
