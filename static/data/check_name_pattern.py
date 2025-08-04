#!/usr/bin/env python3
import csv
import re
from collections import Counter

def analyze_name_patterns(csv_file):
    """Analyze patterns in the Name column of the CSV file."""
    
    # Common patterns we might see based on the sample
    patterns = {
        'township-range-section-subdivision': r'^\d{2}-\d{2}-\d{2}-\d{2}-[A-Z*]-\d+$',
        'township-range-section-lot': r'^\d{2}-\d{2}-\d{2}-\d{2}-\d+$',
        'township-range-section-block-lot': r'^\d{2}-\d{2}-\d{2}-\d{2}-[A-Z]-\d+$',
        'township-range-section-decimal': r'^\d{2}-\d{2}-\d{2}-\d{2}-\d+\.\d+$',
        'township-range-section-simple': r'^\d{2}-\d{2}-\d{2}-\d{2}-\d+$',
    }
    
    pattern_counts = Counter()
    unmatched_names = []
    total_rows = 0
    
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            total_rows += 1
            name = row['Name']
            
            # Check which pattern matches
            matched = False
            for pattern_name, pattern_regex in patterns.items():
                if re.match(pattern_regex, name):
                    pattern_counts[pattern_name] += 1
                    matched = True
                    break
            
            if not matched:
                # Try to identify the pattern structure
                parts = name.split('-')
                if len(parts) == 5:
                    pattern_counts[f'5-part-custom'] += 1
                elif len(parts) == 6:
                    pattern_counts[f'6-part-custom'] += 1
                else:
                    pattern_counts[f'{len(parts)}-part'] += 1
                
                if len(unmatched_names) < 10:  # Keep first 10 unmatched for analysis
                    unmatched_names.append(name)
    
    # Print results
    print(f"Total rows analyzed: {total_rows}")
    print(f"\nPattern distribution:")
    for pattern, count in pattern_counts.most_common():
        percentage = (count / total_rows) * 100
        print(f"  {pattern}: {count} ({percentage:.1f}%)")
    
    if unmatched_names:
        print(f"\nSample of names that didn't match predefined patterns:")
        for name in unmatched_names:
            print(f"  {name}")
    
    # Check if all names follow the same pattern
    if len(pattern_counts) == 1:
        print("\n✓ All names follow the SAME pattern!")
    else:
        print("\n✗ Names follow DIFFERENT patterns")
    
    # Additional analysis - check the structure
    print("\nDetailed structure analysis:")
    structure_counts = Counter()
    
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['Name']
            parts = name.split('-')
            
            # Create a structure signature
            signature = []
            for part in parts:
                if part.isdigit():
                    signature.append('D' * len(part))  # D for digit
                elif part == '*':
                    signature.append('*')
                elif part.replace('.', '').isdigit():
                    signature.append('DEC')  # Decimal number
                elif part.isalpha():
                    signature.append('A' * len(part))  # A for alphabetic
                else:
                    signature.append('X')  # Mixed or unknown
            
            structure_counts['-'.join(signature)] += 1
    
    print("\nStructure patterns (D=digit, A=letter, *=asterisk, DEC=decimal):")
    for structure, count in structure_counts.most_common(10):
        percentage = (count / total_rows) * 100
        print(f"  {structure}: {count} ({percentage:.1f}%)")

if __name__ == "__main__":
    analyze_name_patterns('brevard_parcels.csv')