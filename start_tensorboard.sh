#!/bin/bash

# Start TensorBoard
# Usage: ./start_tensorboard.sh [logdir]
# Default logdir: models/A/logs

LOGDIR=${1:-models/A/logs}

# Use venv's python directly if it exists, otherwise use system python3
if [ -d "venv" ] && [ -f "venv/bin/python" ]; then
    PYTHON_CMD="venv/bin/python"
elif [ -d "venv" ] && [ -f "venv/bin/python3" ]; then
    PYTHON_CMD="venv/bin/python3"
else
    PYTHON_CMD="python3"
fi

echo "Starting TensorBoard with logdir: $LOGDIR"
echo "TensorBoard will be available at http://localhost:6006"
echo "Press CTRL+C to stop"
echo ""

# Use Python wrapper
$PYTHON_CMD start_tensorboard.py "$LOGDIR"

