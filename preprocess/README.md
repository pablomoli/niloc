# Data Preprocessing

Two preprocessing paths exist depending on whether you have real IMU recordings or are starting from scratch on a new building.

---

## 1. Real data

This applies when you have real IMU recordings collected with a compatible app (Google Tango, RoNIN Android app, or Fusion-DHL) and ground-truth trajectories aligned to a common coordinate frame.

Raw data must be in HDF5 format containing:
- `computed/ronin` — inertial odometry trajectory computed from a RoNIN ResNet checkpoint
- `computed/aligned_pos` — ground-truth positions aligned across sequences

The original dataset (universityA, B, C) can be downloaded from the [NILoc project page](https://sachini.github.io/niloc).

### 1.1 Generate occupancy map

If no floorplan image is available, generate one from ground-truth trajectories:

```bash
python real_data/map_creation.py <data folder containing hdf5 files> --map_dpi <pixels per meter>
```

The result `floorplan.png` is saved in the data folder.

### 1.2 Flood-fill

Used during synthetic data generation to determine walkable space:

```bash
python real_data/flood_fill.py <path to floorplan image>
```

### 1.3 Distance-based sampling

Produces the `.txt` training files used by the NiLoc dataloader:

```bash
python preprocess/real_data/distance_sample.py \
    --data_dir <folder with .hdf5 files> \
    --map_dpi <pixels per meter> \
    --out_dir <output folder>
```

Output format per trajectory (one row per sample):
```
ts_seconds   x   y   gt_x   gt_y
```

`x, y` are VIO (RoNIN) estimates; `gt_x, gt_y` are ground truth. All coordinates in pixels at `map_dpi` scale.

---

## 2. Fabricated data (noise injection pipeline)

This is the preferred approach for new buildings where no real IMU data has been collected. The pipeline generates realistic training data by injecting real VIO drift noise (extracted from existing recordings) onto A*-generated synthetic paths.

**When to use this:** When you have a floorplan for a new building but no real sensor recordings yet.

### Overview

```
Floorplan image
      │
      ▼
A* path generation ──► 28 GT paths (Avalon)
      │
      ▼
Noise injection  ◄─── Noise library (2,924 segments from universityA)
      │
      ▼
500 fabricated .txt files  ──► train_synthetic.sh
```

### 2.1 Build the noise library (one-time per noise source)

Extracts VIO drift segments from real recordings:

```bash
uv run python -m preprocess.synthetic_data.build_noise_library \
    --data_dir data/universityA \
    --out_path preprocess/data/noise_library.npy \
    --source_dpi 2.5
```

A pre-built noise library from universityA is already checked in at `preprocess/data/noise_library.npy` (2,924 segments, window=150 frames).

### 2.2 Run fabrication

```bash
uv run python -m preprocess.synthetic_data.fabricate \
    --config preprocess/synthetic_data/configs/fabricate_avalon.yaml
```

Config for Avalon is at `preprocess/synthetic_data/configs/fabricate_avalon.yaml`. Key parameters:

| Parameter | Value | Notes |
|---|---|---|
| `target_dpi` | 10.0 | Avalon px/m (Ana's physical measurement) |
| `source_dpi` | 2.5 | universityA px/m — scales noise to target building |
| `aug_mult` | 5 | Noise augmentation multiplier |
| `n_trajectories` | 500 | Total fabricated trajectories |

Output goes to `outputs/fabricated/avalon_2nd_floor/` — 500 `.txt` files plus `train.txt` and `val.txt` split lists.

### 2.3 Train on fabricated data

```bash
./train_synthetic.sh avalon_2nd_floor /absolute/path/to/outputs/fabricated/avalon_2nd_floor
```

The data path must be absolute because Hydra changes the working directory at runtime.

### Pipeline internals

| Module | Role |
|---|---|
| `astar.py` | A* pathfinding on the flood-filled floorplan |
| `smooth_trajectory.py` | B-spline smoothing for uniform step size |
| `smooth_junctions.py` | Junction-aware smoothing to remove 90° artifacts |
| `build_noise_library.py` | Extracts and indexes VIO drift segments |
| `inject_noise.py` | Applies sampled noise segments onto GT paths |
| `format_output.py` | Writes niloc-compatible `.txt` files |
| `fabricate.py` | Orchestrates the full pipeline |
| `launcher.py` | CLI entry point |

---

## 3. Configuration

| File | What to set |
|---|---|
| `niloc/config/grid/<building>.yaml` | `image_file` path to floorplan, `dpi`, grid `size` and `bounds` |
| `niloc/config/dataset/<building>_syn.yaml` | `root_dir`, `train_list`, `val_list` — pass as CLI overrides for fabricated data |
| `niloc/config/arch/input/cnn1d_<building>.yaml` | CNN input architecture (kernel sizes, channels) |
| `niloc/config/arch/output/cnnfc_<building>.yaml` | CNN output architecture (interim dims determine `d_model`) |
