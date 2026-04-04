# Avalon Retrain — Step-by-Step Instructions

These steps rebuild the noise library from multiple data sources, re-fabricate
the training dataset, and start a fresh 800-epoch training run.

---

## 1. Environment check

Make sure you are in the repo root and the uv environment is active.

```bash
# From the niloc-fork repo root:
which python          # should point into .venv/
uv run python --version   # should print Python 3.9.x
uv run python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
# Expected: torch version, True
```

If `torch.cuda.is_available()` is False, the CUDA wheel is missing. Reinstall:

```bash
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

---

## 2. Pull latest code

```bash
git fetch origin
git checkout fabrication-sprint
git pull origin fabrication-sprint
```

---

## 3. Rebuild the noise library (universityA + officeC)

This replaces the old universityA-only library. The new library stores noise
in metres so it is DPI-agnostic, and resamples all sources to 1 Hz so every
150-frame segment represents exactly 150 seconds of real drift.

```bash
uv run python -m preprocess.synthetic_data.build_noise_library \
    --data-dir data/universityA \
    --source-dpi 2.5 \
    --target-freq 1.0 \
    --window 150 \
    --stride 50 \
    --extra-sources data/universityB data/officeC \
    --out-dir preprocess/data \
    --plot
```

Expected output (numbers may vary slightly):
```
Total trajectories: 169
1573 raw segments
...
Done. 1573 segments, window=150, stride=50
Mean drift: 24.xxxx m
```

---

## 4. Re-fabricate the Avalon training dataset (800 trajectories)

This overwrites `outputs/fabricated/avalon_2nd_floor/` with 800 trajectories
(up from 500) using the new multi-source noise library.

```bash
uv run python -m preprocess.synthetic_data.fabricate
```

Expected output:
```
n_trajectories : 800
total_frames   : ~61000
mean_drift_px  : ~170-190
Validation passed
```

---

## 5. Start training — fresh run, 800 epochs

Start a new training run from scratch (do not resume from the old epoch=99
checkpoint — the dataset changed).

```bash
bash train_synthetic.sh avalon_2nd_floor \
    $(pwd)/outputs/fabricated/avalon_2nd_floor
```

Training checkpoints save every 10 epochs to:
```
models/avalon_2nd_floor_syn/version_1/   (version number increments automatically)
```

To monitor loss in TensorBoard:
```bash
bash watch.sh
```

---

## 6. What to expect

The teacher forcing ratio (`tr_ratio`) schedule:

| Epoch range | tr_ratio | Decoder behavior |
|-------------|----------|-----------------|
| 0 – 74      | 1.00     | always fed ground truth (warmup) |
| 75 – ~575   | 1.00 → 0.00 | gradually autonomous (-0.01 every 5 epochs) |
| 575 – 800   | 0.00     | fully autonomous prediction |

The decoder will not produce useful inference until roughly **epoch 400**
(ratio ~0.50). Encoder-only results are meaningful from epoch ~100 onward.

---

## Notes

- Do not upgrade `pytorch-lightning` — it is pinned to 1.2.6.
- The fabricated data is at 1 Hz. Do not change `imu_freq` in `avalon_syn.yaml`.
- If training is interrupted it can be resumed by adding a resume checkpoint
  override directly to the trainer call in `train_synthetic.sh`:
  ```
  +train_cfg.resume_from_checkpoint=models/avalon_2nd_floor_syn/version_1/epoch=NNN-tr_ratio=....ckpt
  ```
