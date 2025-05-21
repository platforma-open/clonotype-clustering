import sys
import argparse # Import the argparse module
from Levenshtein import distance as levenshtein_distance

# --- Functions ---

def parse_fasta(fasta_file):
    """
    Parses a FASTA file and returns a dictionary of {sequence_id: sequence_string}.
    Handles multi-line sequences.
    """
    sequences = {}
    current_id = None
    current_sequence = []
    try:
        with open(fasta_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if line.startswith('>'):
                    # Take only the ID, up to the first space (common FASTA header format)
                    if current_id:
                        sequences[current_id] = "".join(current_sequence)
                    current_id = line[1:].split(' ')[0]
                    current_sequence = []
                else:
                    current_sequence.append(line)
            if current_id: # Add the last sequence after loop
                sequences[current_id] = "".join(current_sequence)
    except FileNotFoundError:
        sys.exit(f"Error: FASTA file '{fasta_file}' not found. Please check the path.")
    except Exception as e:
        sys.exit(f"Error reading FASTA file '{fasta_file}': {e}")
    return sequences

def calculate_normalized_levenshtein(s1, s2):
    """
    Calculates the normalized Levenshtein distance between two strings.
    Normalization: Levenshtein_Distance / max(len(s1), len(s2)).
    Returns 0.0 if both strings are empty.
    """
    if not s1 and not s2:
        return 0.0
    
    max_len = max(len(s1), len(s2))
    
    if max_len == 0: # This case covers both strings being empty
        return 0.0
    
    dist = levenshtein_distance(s1, s2)
    return dist / max_len

# --- Main Script Execution ---

if __name__ == "__main__":
    # Setup command-line argument parsing
    parser = argparse.ArgumentParser(
        description="Calculate normalized Levenshtein distance between sequences and their cluster centroids.",
        formatter_class=argparse.RawTextHelpFormatter # For better formatting of description
    )
    parser.add_argument(
        '-f', '--fasta', 
        type=str, 
        required=True,
        help="Path to the input FASTA file containing all sequences."
    )
    parser.add_argument(
        '-c', '--cluster', 
        type=str, 
        required=True,
        help="Path to the MMseqs2 cluster file (e.g., 'results_dir_cluster.tsv').\n"
             "Expected format: Centroid_ID\\tMember_ID"
    )
    parser.add_argument(
        '-o', '--output', 
        type=str, 
        default='centroid_distances_levenshtein.tsv', # Default output filename
        help="Path to the output TSV file for distances.\n"
             "Default: 'centroid_distances_levenshtein.tsv'"
    )

    args = parser.parse_args()

    print("Starting Levenshtein distance calculation...")

    # 1. Load all sequences from the FASTA file
    print(f"Parsing sequences from {args.fasta}...")
    all_sequences = parse_fasta(args.fasta)
    print(f"Loaded {len(all_sequences)} sequences.")

    # 2. Load cluster assignments (Member ID -> Centroid ID)
    member_centroid_map = {}
    try:
        with open(args.cluster, 'r') as infile:
            for line in infile:
                parts = line.strip().split('\t')
                if len(parts) == 2:
                    centroid_id = parts[0] # First column is Centroid_ID in mmseqs _cluster.tsv
                    member_id = parts[1]   # Second column is Member_ID
                    member_centroid_map[member_id] = centroid_id
                else:
                    sys.stderr.write(f"Warning: Skipping malformed line in {args.cluster}: '{line.strip()}'\n")
    except FileNotFoundError:
        sys.exit(f"Error: Cluster file '{args.cluster}' not found.\n"
                 f"Please ensure mmseqs easy-cluster has been run and check the path.")
    except Exception as e:
        sys.exit(f"Error reading cluster file '{args.cluster}': {e}")

    print(f"Loaded {len(member_centroid_map)} member-to-centroid assignments from {args.cluster}.")

    # 3. Calculate distances and write to output file
    processed_members_count = 0
    missing_sequence_count = 0
    try:
        with open(args.output, 'w') as outfile:
            outfile.write("Member_ID\tCentroid_ID\tDistance_to_Centroid\n") # Header for the output TSV

            for member_id, centroid_id in member_centroid_map.items():
                member_seq = all_sequences.get(member_id)
                centroid_seq = all_sequences.get(centroid_id)

                # Handle cases where a sequence might be missing from the FASTA (should ideally not happen)
                if member_seq is None:
                    sys.stderr.write(f"Warning: Sequence for member '{member_id}' not found in FASTA file. Skipping calculation for this member.\n")
                    missing_sequence_count += 1
                    continue
                if centroid_seq is None:
                    sys.stderr.write(f"Warning: Sequence for centroid '{centroid_id}' not found in FASTA file. Skipping calculation for this member.\n")
                    missing_sequence_count += 1
                    continue

                distance = 0.0 # Default for self-alignment or identical

                # If a sequence is its own centroid, the distance is 0.0
                if member_id == centroid_id:
                    distance = 0.0
                else:
                    # Calculate normalized Levenshtein distance
                    distance = calculate_normalized_levenshtein(member_seq, centroid_seq)
                
                # Write the result to the output file
                outfile.write(f"{member_id}\t{centroid_id}\t{distance:.4f}\n")
                processed_members_count += 1
        
        print(f"\nSuccessfully calculated and wrote distances for {processed_members_count} members to '{args.output}'.")
        if missing_sequence_count > 0:
            print(f"Note: Skipped {missing_sequence_count} members due to missing sequence data in the provided FASTA file.")

    except Exception as e:
        sys.exit(f"Error writing to output file '{args.output}': {e}")

    print("Levenshtein distance calculation complete.")