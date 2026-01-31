#!/bin/bash

# Create checkpoint files for all buildings
# Usage: ./create_checkpoint_files.sh

echo "Creating checkpoint files for buildings A, B, and C..."

cat > checkpoints_A.txt << EOF
best models/A/version_0/best_checkpoint.ckpt
EOF

cat > checkpoints_B.txt << EOF
best models/B/version_0/best_checkpoint.ckpt
EOF

cat > checkpoints_C.txt << EOF
best models/C/version_0/best_checkpoint.ckpt
EOF

echo "Created:"
echo "  - checkpoints_A.txt"
echo "  - checkpoints_B.txt"
echo "  - checkpoints_C.txt"
echo ""
echo "You can now run:"
echo "  ./test_imu.sh A checkpoints_A.txt          # Minimal evaluation"
echo "  ./test_imu_viz.sh A checkpoints_A.txt      # With visualizations"

