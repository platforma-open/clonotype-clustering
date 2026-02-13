import pandas as pd
import argparse


def trim_sequence(sequence, trim_start, trim_end):
    """Trim amino acids from the beginning and end of a sequence."""
    if sequence is None or sequence == '':
        return ''

    # Convert to string if it's not already
    seq_str = str(sequence)

    # Apply trimming
    if trim_start > 0:
        seq_str = seq_str[trim_start:]

    if trim_end > 0 and len(seq_str) > trim_end:
        seq_str = seq_str[:-trim_end]

    return seq_str


def main():
    parser = argparse.ArgumentParser(description='Prepare FASTA file for clustering')
    parser.add_argument('--trim-start', type=int, default=0, help='Number of amino acids to remove from start')
    parser.add_argument('--trim-end', type=int, default=0, help='Number of amino acids to remove from end')
    parser.add_argument('--per-chain-trim', action='store_true', help='Apply trimming to each chain before concatenation')

    args = parser.parse_args()

    input_file = "input.tsv"

    df = pd.read_csv(input_file, sep="\t")

    # Replace NA values with empty strings in the dataframe
    df = df.fillna('')

    # Create a fasta file from the dataframe
    output_file = "output.fasta"

    # Collect sequence columns
    sequence_cols = [col for col in df.columns if col.startswith('sequence_')]

    if args.per_chain_trim and (args.trim_start > 0 or args.trim_end > 0):
        # Apply trimming to each chain separately, then concatenate
        trimmed_parts = []
        for col in sequence_cols:
            trimmed_col = df[col].apply(lambda s: trim_sequence(s, args.trim_start, args.trim_end))
            trimmed_parts.append(trimmed_col)
        if trimmed_parts:
            df['sequence'] = pd.concat(trimmed_parts, axis=1).agg("====".join, axis=1)
        else:
            df['sequence'] = ''
    else:
        # Concatenate first, then optionally trim the combined sequence
        df['sequence'] = df[sequence_cols].agg("====".join, axis=1)
        if args.trim_start > 0 or args.trim_end > 0:
            df['sequence'] = df['sequence'].apply(
                lambda seq: trim_sequence(seq, args.trim_start, args.trim_end)
            )

    # De-duplicate: pick one representative clonotypeKey per unique sequence.
    # This reduces MMseqs2 input size dramatically (e.g. 243K -> 29K) and
    # eliminates the problem of identical sequences landing in different clusters.
    representatives = df.drop_duplicates(subset='sequence', keep='first')

    print(f"\n=== FASTA Diagnostics ===")
    print(f"Total clonotypes: {len(df)}")
    print(f"Unique sequences (written to FASTA): {len(representatives)}")
    seq_lens = representatives['sequence'].str.len()
    print(f"Sequence lengths: min={seq_lens.min()}, max={seq_lens.max()}, mean={seq_lens.mean():.1f}")
    print(f"Empty sequences: {(seq_lens == 0).sum()}")
    print(f"Sequences < 6 aa: {(seq_lens < 6).sum()}")

    # Write dedup mapping: representativeKey -> clonotypeKey (one row per original key)
    mapping = df[['clonotypeKey', 'sequence']].merge(
        representatives[['clonotypeKey', 'sequence']].rename(columns={'clonotypeKey': 'representativeKey'}),
        on='sequence',
        how='inner'
    )[['representativeKey', 'clonotypeKey']]
    mapping.to_csv("dedup_mapping.tsv", sep="\t", index=False)
    print(f"Dedup mapping: {len(mapping)} total keys -> {len(representatives)} representatives")

    # Write FASTA with only representative sequences, adding a fixed "s-" prefix.
    fasta_df = representatives[['clonotypeKey', 'sequence']].copy()
    fasta_df['clonotypeKey'] = '>s-' + fasta_df['clonotypeKey'].astype(str)
    fasta_df.to_csv(output_file, sep='\n', index=False, header=False)

    print(f"Fasta file created: {output_file}")
    if args.trim_start > 0 or args.trim_end > 0:
        mode = 'per-chain' if args.per_chain_trim else 'global'
        print(f"Applied {mode} trimming: {args.trim_start} from start, {args.trim_end} from end")


if __name__ == "__main__":
    main()
