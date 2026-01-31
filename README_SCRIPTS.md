# NILoc Scripts Guide

## Quick Start

### 1. Create Checkpoint Files
```bash
./create_checkpoint_files.sh
```
This creates `checkpoints_A.txt`, `checkpoints_B.txt`, and `checkpoints_C.txt` for all buildings.

### 2. Run Evaluation

**Minimal evaluation (fast, no visualizations):**
```bash
./test_imu.sh A checkpoints_A.txt
```

**Full evaluation with visualizations:**
```bash
./test_imu_viz.sh A checkpoints_A.txt
```

### 3. View Results in TensorBoard

**Start TensorBoard (with warnings suppressed):**
```bash
./start_tensorboard.sh
```

Or specify a custom log directory:
```bash
./start_tensorboard.sh models/A/logs
```

Then open http://localhost:6006 in your browser.

## Scripts Overview

- **`train_imu.sh`** - Train models from scratch or fine-tune from pretrained checkpoints
- **`train_synthetic.sh`** - Pre-train using synthetic data
- **`test_imu.sh`** - Fast evaluation without visualizations
- **`test_imu_viz.sh`** - Full evaluation with trajectory visualizations
- **`start_tensorboard.sh`** - Start TensorBoard with warnings suppressed
- **`create_checkpoint_files.sh`** - Create checkpoint files for all buildings

## Visualization Options

The `test_imu_viz.sh` script generates:
- **Full trajectory heatmaps**: Videos showing location probabilities over time
- **Error plots**: Trajectory comparison plots with:
  - Red line = Ground truth trajectory
  - Blue dashed line = Predicted trajectory
  - Heatmap overlay = Model confidence

## Results Location

Results are saved to:
- `models/{building}/logs/version_0/out*/` - Evaluation results
- `models/{building}/logs/version_0/out*/out/` - Trajectory text files
- `models/{building}/logs/version_0/out*/errors.txt` - Error metrics

