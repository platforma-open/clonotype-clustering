import pandas as pd


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

# If we got both chains merge by groups and then all together
sequence_cols = [col for col in df.columns 
                if col.startswith('sequence_second_')]
if len(sequence_cols) > 0:
    df['sequence_second'] = df[sequence_cols].agg("====".join, axis=1)
    # Finally merge both chains if present
    df['sequence'] = df['sequence'] + "====" + df['sequence_second']

# Reformat and store table in fasta format
df['clonotypeKey'] = '>' + df['clonotypeKey']
df[['clonotypeKey', 'sequence']].to_csv(output_file, 
                                        sep='\n', 
                                        index=False, 
                                        header=False)
print(f"Fasta file created: {output_file}")
