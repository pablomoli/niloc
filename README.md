# NiLoc — Neural Inertial Localization

Indoor localization from IMU data. Takes inertial odometry (VIO) position tracks and outputs a probability distribution over a floorplan grid.

---

## Environment setup

Managed with [uv](https://github.com/astral-sh/uv).

```bash
uv venv --python 3.9 .venv
source .venv/bin/activate

# Apple Silicon (MPS)
uv pip install -e ".[mps]"

# Linux + NVIDIA GPU (match your installed CUDA version)
uv pip install -e ".[cuda]"
uv pip install torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu118
```

Device is auto-detected at runtime: CUDA if available, MPS on Apple Silicon, CPU otherwise. No flags needed.

---

## Config setup

Before training, set machine-specific paths in:

| File | What to set |
|---|---|
| `niloc/config/dataset/<building>.yaml` | `root_dir`, `train_list`, `val_list` paths |
| `niloc/config/grid/<building>.yaml` | `image_file` path to `floorplan.png` |
| `niloc/config/io/default.yaml` | `root_path` for checkpoint output |

---

## Training

### Pretrain on synthetic data

```bash
./train_synthetic.sh <building>
```

Supported buildings: `A`, `B`, `C`, `avalon_2nd_floor`

`d_model` values per building are defined in `train_synthetic.sh`. The script picks the right one automatically.

### Train on real IMU data

```bash
# from scratch
./train_imu.sh <building>

# from a pretrained checkpoint
./train_imu.sh <building> <path/to/checkpoint.ckpt>
```

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

### Synthetic data (A* based)

```bash
python preprocess/gen_synthic_data.py
```

Config lives in `preprocess/config/synthetic_data.yaml`. Output format is identical to real data.

---

## Evaluation

```bash
./test_imu.sh <building> <checkpoint_list_file>
```

See `niloc/cmd_test_file.py` for the checkpoint list format. Outputs error CDFs, trajectory plots, and TensorBoard logs.

---

## Adding a new building

1. Add floorplan image to `niloc/data/<building>/floorplan.png`
2. Create `niloc/config/grid/<building>.yaml` — set `size`, `bounds`, `elements` (= width × height), `dpi`, `image_file`
3. Create `niloc/config/dataset/<building>_syn.yaml` with data paths
4. Create `niloc/config/arch/input/cnn1d_<building>.yaml` and `niloc/config/arch/output/cnnfc_<building>.yaml`
5. Add `["<building>"]=<d_model>` to the `model_dim` map in `train_synthetic.sh`

`d_model` for a new building should equal `channels[0] * interim_dim[0] * interim_dim[1]` from the `cnnfc` output config. The CNN input/output projections handle any mismatch with grid dimensions automatically.
