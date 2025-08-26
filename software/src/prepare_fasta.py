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

    # Reformat and store table in fasta format, adding a fixed "s-" prefix.
    df['clonotypeKey'] = '>s-' + df['clonotypeKey'].astype(str)
    df[['clonotypeKey', 'sequence']].to_csv(output_file,
                                            sep='\n',
                                            index=False,
                                            header=False)
    print(f"Fasta file created: {output_file}")
    if args.trim_start > 0 or args.trim_end > 0:
        mode = 'per-chain' if args.per_chain_trim else 'global'
        print(f"Applied {mode} trimming: {args.trim_start} from start, {args.trim_end} from end")


if __name__ == "__main__":
    main()