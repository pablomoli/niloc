#!/usr/bin/env python3
"""
Start TensorBoard
"""
import sys

# Import and run tensorboard
try:
    from tensorboard.main import main as tensorboard_main
    
    # Build command line arguments
    logdir = sys.argv[1] if len(sys.argv) > 1 else "models/A/logs"
    sys.argv = ["tensorboard", "--logdir", logdir]
    
    tensorboard_main()
except ImportError:
    print("Error: TensorBoard not found. Install with: pip install tensorboard")
    sys.exit(1)
except KeyboardInterrupt:
    print("\nTensorBoard stopped.")
    sys.exit(0)

