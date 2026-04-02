#!/bin/bash
# Start TensorBoard for a run or all runs.
#
# Usage:
#   bash watch.sh                    # all runs under models/
#   bash watch.sh models/A           # one building
#   bash watch.sh models/A/train     # training only
#   bash watch.sh models/A/eval      # eval only
#
# Set TB_PORT env var to override port (default 6006).

PORT=${TB_PORT:-6006}
LOGDIR=${1:-models}

echo "TensorBoard → http://localhost:${PORT}"
echo "logdir: ${LOGDIR}"
uv run tensorboard --logdir "$LOGDIR" --port "$PORT"
