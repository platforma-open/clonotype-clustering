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
df['sequence'] = df[sequence_cols].agg(''.join, axis=1)

# If we got both chains merge by groups and then all together
sequence_cols = [col for col in df.columns 
                if col.startswith('sequence_second_')]
if len(sequence_cols) > 0:
    df['sequence_second'] = df[sequence_cols].agg(''.join, axis=1)
    # Finally merge both chains if present
    df['sequence'] = df['sequence'] + "====" + df['sequence_second']

with open(output_file, "w") as fasta_file:
    for index, row in df.iterrows():
        # Write header line with '>' prefix followed by clonotypeKey
        fasta_file.write(f">{row['clonotypeKey']}\n")
        sequence = row['sequence']
        # Write sequence line
        fasta_file.write(f"{sequence}\n")

print(f"Fasta file created: {output_file}")
