import pandas as pd
import argparse


def trim_sequence(sequence, trim_start, trim_end):
    """Trim amino acids from the beginning and end of a sequence."""
    if not sequence or sequence == '':
        return sequence
    
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
    
    args = parser.parse_args()
    
    input_file = "input.tsv"
    
    df = pd.read_csv(input_file, sep="\t")
    
    # Replace NA values with empty strings in the dataframe
    df = df.fillna('')
    
    # Create a fasta file from the dataframe
    output_file = "output.fasta"
    
    # Concatenate all sequence columns if we have them
    sequence_cols = [col for col in df.columns 
                     if col.startswith('sequence_')]
    df['sequence'] = df[sequence_cols].agg("====".join, axis=1)
    
    # Apply trimming to sequences
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
        print(f"Applied trimming: {args.trim_start} from start, {args.trim_end} from end")


if __name__ == "__main__":
    main()