#!/bin/bash
# Generate walkability masks for all buildings from trajectory data.
# Run from the project root directory.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generating walkability mask for building A (universityA)..."
python -m niloc.utils.walkability_mask \
    --data_dir data/universityA \
    --grid_h 211 --grid_w 157 \
    --bounds 0 211 0 157 \
    --cell_length 1.0 \
    --output data/universityA/walkability_mask.npy

echo "Generating walkability mask for building B (universityB)..."
python -m niloc.utils.walkability_mask \
    --data_dir data/universityB \
    --grid_h 144 --grid_w 368 \
    --bounds 0 144 0 368 \
    --cell_length 1.0 \
    --output data/universityB/walkability_mask.npy

echo "Generating walkability mask for building C (officeC)..."
python -m niloc.utils.walkability_mask \
    --data_dir data/officeC \
    --grid_h 112 --grid_w 384 \
    --bounds 0 112 0 384 \
    --cell_length 1.0 \
    --output data/officeC/walkability_mask.npy

echo "Done. Masks saved to data/*/walkability_mask.npy"
