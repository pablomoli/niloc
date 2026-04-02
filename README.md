# NiLoc — Neural Inertial Localization

Indoor localization from IMU data. Takes inertial odometry (VIO) position tracks and outputs a probability distribution over a floorplan grid.

---

## Environment setup

Managed with [uv](https://github.com/astral-sh/uv). Python 3.9 is required (pinned in `.python-version`).

**Do not use conda.** The project has been fully migrated to uv + `pyproject.toml`. There is no `niloc_env.yml` and no conda environment to activate.

```bash
# Apple Silicon (MPS)
uv sync
uv pip install -e ".[mps]"

# Linux + NVIDIA GPU (match your installed CUDA version)
uv sync
uv pip install -e ".[cuda]" --index-url https://download.pytorch.org/whl/cu118
```

Device is auto-detected at runtime: CUDA if available, MPS on Apple Silicon, CPU otherwise. No flags needed.

---

## End-to-end workflows

### Avalon 2nd floor (fabricated data — no real recordings needed)

This is the workflow for training on a new building using synthetic data fabrication.

**Prerequisites — these files must exist:**

| File | Status |
|---|---|
| `niloc/data/avalon/floorplan.png` | Checked in |
| `data/avalon/synthetic_output/` (GT path `.txt` files) | Checked in |
| `preprocess/data/noise_library.npy` | Checked in |
| `niloc/config/grid/avalon_2nd_floor.yaml` | Checked in |
| `niloc/config/arch/input/cnn1d_avalon_2nd_floor.yaml` | Checked in |
| `niloc/config/arch/output/cnnfc_avalon_2nd_floor.yaml` | Checked in |

**Steps:**

```bash
# 1. Install dependencies
uv sync && uv pip install -e ".[mps]"          # Mac (MPS)
# or:
uv sync && uv pip install -e ".[cuda]" --index-url https://download.pytorch.org/whl/cu118  # Linux + NVIDIA

# 2. Generate fabricated training data (~1–2 min)
uv run python -m preprocess.synthetic_data.fabricate \
    --config preprocess/synthetic_data/configs/fabricate_avalon.yaml
# Output: outputs/fabricated/avalon_2nd_floor/  (500 trajectories)

# 3. Train (use absolute path — Hydra changes working directory at runtime)
uv run bash train_synthetic.sh avalon_2nd_floor $(pwd)/outputs/fabricated/avalon_2nd_floor

# 4. Monitor in TensorBoard (separate terminal)
bash watch.sh models/avalon_2nd_floor
```

---

### Buildings A / B / C (real IMU data)

**Prerequisites:**
- Download the NILoc dataset from the [project website](https://sachini.github.io/niloc)
- Raw HDF5 files must contain `computed/ronin` and `computed/aligned_pos`
- Set `root_path` in `niloc/config/io/default.yaml` to your checkpoint output directory

```bash
# 1. Install dependencies
uv sync && uv pip install -e ".[mps]"   # Mac; use [cuda] on Linux+NVIDIA

# 2. Preprocess raw HDF5 → .txt training files
python preprocess/real_data/distance_sample.py \
    --data_dir <folder with .hdf5 files> \
    --map_dpi <pixels per meter> \
    --out_dir <output folder>

# 3. Set data paths in niloc/config/dataset/<building>.yaml
#    (root_dir, train_list, val_list)

# 4. Train
uv run bash train_synthetic.sh <building>   # pretrain on synthetic data first (optional)
uv run bash train_imu.sh <building>          # train on real IMU data

# 5. Evaluate
uv run bash test_imu.sh <building> <checkpoint_list_file>
```

---

## Config setup

Before training, set machine-specific paths in:

| File | What to set |
|---|---|
| `niloc/config/dataset/<building>.yaml` | `root_dir`, `train_list`, `val_list` paths |
| `niloc/config/grid/<building>.yaml` | `image_file` path to `floorplan.png` |
| `niloc/config/io/default.yaml` | `root_path` for checkpoint output |

For fabricated (synthetic) datasets, `root_dir`, `train_list`, and `val_list` must all be passed as CLI overrides to `train_synthetic.sh` — see the training section below.

---

## Training

### Pretrain on fabricated (synthetic) data

```bash
# Buildings A, B, C — data paths baked into the script
./train_synthetic.sh <building>

# Avalon 2nd floor — fabricated data path required
./train_synthetic.sh avalon_2nd_floor /absolute/path/to/outputs/fabricated/avalon_2nd_floor
```

Supported buildings: `A`, `B`, `C`, `avalon_2nd_floor`

`d_model` values per building are defined in `train_synthetic.sh`. The script picks the right one automatically.

Checkpoints are saved under `models/<building>/train/<version>/`.

### Train on real IMU data

```bash
# from scratch
./train_imu.sh <building>

# from a pretrained checkpoint
./train_imu.sh <building> <path/to/checkpoint.ckpt>
```

---

## Monitoring training

```bash
# Watch all runs under models/
bash watch.sh

# Watch a specific building
bash watch.sh models/A

# Custom port
TB_PORT=6007 bash watch.sh models/A
```

TensorBoard logs are written to `models/<building>/train/<version>/`.

---

## Evaluation

```bash
./test_imu.sh <building> <checkpoint_list_file>
```

See `niloc/cmd_test_file.py` for the checkpoint list format. Outputs error CDFs, trajectory plots, and TensorBoard logs under `models/<building>/eval/`.

### Visualizing inference output

```bash
# Plot predicted vs ground-truth trajectories for a completed eval run
uv run python plot_run.py models/A/eval/version_0_out

# Plot fabricated training trajectories on the Avalon floorplan
uv run python plot_run.py outputs/fabricated/avalon_2nd_floor \
    --grid niloc/config/grid/avalon_2nd_floor.yaml \
    --max 20
```

Output is saved as `trajectory_summary.png` in the run directory. Safe to run while inference is still in progress.

---

## Data preprocessing

### Real data

IMU data must be preprocessed to HDF5 format containing:
- `computed/ronin` — inertial odometry trajectory (from RoNIN ResNet checkpoint)
- `computed/aligned_pos` — ground-truth positions aligned to a common coordinate frame

Then run distance-based sampling to produce `.txt` training files:

```bash
python preprocess/real_data/distance_sample.py \
    --data_dir <folder with .hdf5 files> \
    --map_dpi <pixels per meter> \
    --out_dir <output folder>
```

Output `.txt` format: `ts_seconds, x, y, gt_x, gt_y` (x/y are VIO estimates, gt_x/gt_y are ground truth, both in pixels).

### Floorplan / occupancy map

If no floorplan image is available, generate one from ground-truth trajectories:

```bash
python real_data/map_creation.py <data folder> --map_dpi <pixels per meter>
```

### Fabricated data (noise injection pipeline)

Fabricated data is generated by injecting real VIO drift from existing recordings onto A*-generated synthetic paths. This is the preferred way to bootstrap training on a new building without collecting real IMU data.

```bash
uv run python -m preprocess.synthetic_data.fabricate \
    --config preprocess/synthetic_data/configs/fabricate_avalon.yaml
```

Output goes to `outputs/fabricated/<building>/` — 500 `.txt` files in the same `ts, x, y, gt_x, gt_y` format as real data.

See `preprocess/README.md` for the full pipeline description.

---

## Adding a new building

1. Add floorplan image to `data/<building>/floorplan.png`
2. Create `niloc/config/grid/<building>.yaml` — set `size`, `bounds`, `elements` (= width × height), `dpi`, `image_file`
3. Create `niloc/config/dataset/<building>_syn.yaml` with data paths
4. Create `niloc/config/arch/input/cnn1d_<building>.yaml` and `niloc/config/arch/output/cnnfc_<building>.yaml`
5. Add `["<building>"]=<d_model>` to the `model_dim` map in `train_synthetic.sh`

`d_model` for a new building should equal `channels[0] * interim_dim[0] * interim_dim[1]` from the `cnnfc` output config. The CNN input/output projections handle any mismatch with grid dimensions automatically.

---

## Supported buildings

| Building | DPI (px/m) | Grid | Training data |
|---|---|---|---|
| A (universityA) | 2.5 | — | Real IMU |
| B (universityB) | 2.5 | — | Real IMU |
| C (officeC) | — | — | Real IMU |
| avalon_2nd_floor | 10.0 | 411 × 221 | Fabricated (synthetic) |
