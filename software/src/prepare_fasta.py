import pandas as pd


input_file = "input.tsv"

df = pd.read_csv(input_file, sep="\t")

# Replace NA values with empty strings in the dataframe
df = df.fillna('')

# Create a fasta file from the dataframe
output_file = "output.fasta"

with open(output_file, "w") as fasta_file:
    for index, row in df.iterrows():
        # Write header line with '>' prefix followed by clonotypeKey
        fasta_file.write(f">{row['clonotypeKey']}\n")
        sequence = row['aaCDR3']
        if 'aaCDR3_second' in row and pd.notna(row['aaCDR3_second']):
            sequence += "====" + row['aaCDR3_second']
        # Write sequence line
        fasta_file.write(f"{sequence}\n")

print(f"Fasta file created: {output_file}")
