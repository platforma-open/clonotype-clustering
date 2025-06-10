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

# Reformat and store table in fasta format, adding a fixed "s-" prefix.
df['clonotypeKey'] = '>s-' + df['clonotypeKey'].astype(str)
df[['clonotypeKey', 'sequence']].to_csv(output_file, 
                                        sep='\n', 
                                        index=False, 
                                        header=False)
print(f"Fasta file created: {output_file}")