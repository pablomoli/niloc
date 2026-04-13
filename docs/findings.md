# NILOC Research Findings

Running log of empirical observations, measurements, and decisions that should
inform the paper. Updated as new results come in.

---

## Building: Avalon 2nd Floor

### Physical Dimensions (ground truth from DXF)
- **Size**: 42.32 m × 22.94 m (~139 ft × 75 ft)
- **Source**: `preprocess/data/dxf files/2nd floor.dxf`, wall-layer bounding box
- **DXF scale**: 9.71 px/m (X), 9.64 px/m (Y) — consistent with the nominal dpi=10 in config
- **Implication**: The grid config `dpi: 10` is correct to within 3%. No recalibration needed.

### GPS Orientation
- The building long axis is oriented **~10° east of true north** in WGS84.
- Derived visually by matching the IMDF Level-2 polygon boundary to the floorplan
  using `preprocess/synthetic_data/tune_transform.py --grid`.
- GPS node centroid used as anchor (no physical anchor point available from recordings).
- **Implication**: Any GPS→pixel transform must apply a 10° rotation, not a pure
  north-is-right or north-is-up mapping.

### DXF Coordinate System
- The DXF is a **local CAD frame**, not geographically oriented.
- Building long axis aligns with DXF-X (as is standard CAD practice).
- DXF-X → floorplan col (long axis), DXF-Y → floorplan row (inverted, CAD Y-up).
- No geographic rotation needed for DXF→pixel transforms.
- **Implication**: GPS and DXF transforms are independent; cannot be naively composed.

---

## Navigation Graph (IMDF Level 2)

### Source
- MappingForMassesMobile/IMDF/IMDFAvalon — built for a different product, unverified quality.
- Level 2 ID: `381a4b7d-b3bb-4679-af88-db44669c88ad`

### Validation Results (issue #15)
- 124 Level-2 navigable points → **112 valid** after walkability mask filtering (90% pass rate)
- 113 edges → **112 valid** after Bresenham wall-crossing check (99% pass rate)
- 12 rejected nodes are IMDF room-interior anchors (not corridor nodes)
- See issue #27 for room-entry node handling

### Walkability Mask Quality
- **Density-based mask** (`floorplan.png.npy`): 37,817 walkable px / 90,831 total (41.6%)
  — derived from actual walk recordings; has coverage gaps in unwalked areas.
- **DXF-derived mask** (`walkability_mask_dxf.npy`): 72,907 walkable px / 90,831 total (80.3%)
  — derived from architectural wall geometry; covers the full floor.
- **Implication**: Graph-based path generation (issue #1b) should use the DXF mask to
  reach all corridors, not just historically walked ones. Training on density-mask-limited
  paths would systematically under-represent the outer corridors and dead-end offices.

---

## Fabrication Pipeline

### Motion-Typed Noise Injection (issue #17)
- Noise segments classified at build time by GT motion type: 830 straight /
  737 turn / 6 stationary (out of 1573 total).
- Classifier uses p90 of per-step heading changes, not the maximum.
  Using max caused 98% of 150-frame windows to be "turn" (any indoor walk
  contains at least one >20° step over 150 s). p90 >20° requires >10% of
  steps to be sharply turning, which correctly identifies wiggling/zig-zag
  corridors vs long straight runs.
- Stationary bucket (6 segments) falls below MIN_BUCKET_SIZE=10 → always
  falls back to full library. Too few stationary recordings in source data.
- **Implication**: straight-corridor paths now draw noise from straight-
  corridor segments; turn paths from turn segments. Physically inconsistent
  cross-injection (sharp-turn drift on a straight corridor) is eliminated.

### Noise Library (as of fabrication-sprint branch)
- 1,573 segments from universityA + universityB + officeC
- Stored in metres, DPI-agnostic (issue #14 fix)
- Window: 150 s @ 1 Hz

### Current Training Data
- 800 fabricated trajectories, 5× noise augmentation
- Paths from density-map A* (biased toward historically walked corridors)
- Ana's 800-epoch retrain completed 2026-04-05 (~7.3 hours on NVIDIA GPU)

### Known Fabrication Bias
- Density-map sampling over-represents the central corridor and under-represents
  outer offices and dead ends. Graph-based paths (issue #1b) will correct this.

### Graph-Based Path Generator (issue #16)
- 200 GT paths generated from 112-node Avalon IMDF graph in ~1 s on M3 MBP.
- Dijkstra finds shortest routes; many node pairs are adjacent corridor
  intersections, producing paths as short as 3 frames at 12 px/s. Fixed by:
  (a) lowering `avg_speed_px_s` to 5.0 (~0.5 m/s), and (b) enforcing
  `min_frames=60` — short paths are retried rather than accepted.
- With these settings: mean=74 frames, min=60, max=123 at 1 Hz.
  Consistent with density-map GT distribution (mean=76, min=30, max=150).
  1271 Dijkstra calls needed to accept 200 paths (~6× overhead from the filter).
- The 150-frame noise library window still exceeds the longest graph path (123).
  The noise injector handles this correctly by truncating the segment.
- B-spline arc-length reparameterisation without density-map optimisation is
  adequate because graph nodes are walkable by construction.
- **Implication**: Graph paths give uniform spatial coverage across the full
  floor. Density-map bias is eliminated. Validation pipeline accepted all
  spot-checked trajectories with mean VIO drift 146 px (higher than earlier
  35.9 px because longer paths accumulate more drift — expected and correct).

---

## Baseline Model Validation (2026-04-05)

### Training Run: Ana's 800-Epoch Baseline
- **Checkpoint**: `runs/models/avalon_2nd_floor_syn/version_0/epoch=799-tr_ratio=0.0-train_enc_loss_epoch=5.27.ckpt`
- **Final train loss**: 5.27 (encoder loss; no val split exists for fabricated data)
- **tr_ratio decay**: 1.0 → 0.0 over 800 epochs; teacher forcing fully off from ~epoch 530
- **Architecture**: transformer_2branch, d_model=128, 8 heads, 2 enc/dec layers
- **Train set**: 14,032 windows from 800 fabricated trajectories

### Evaluation on Real Sessions (4 Avalon recordings, 2026-03-31)
Test data: `outputs/niloc_input_1hz/` — real RoNIN-processed sessions from the Avalon 2nd floor.
Compared epoch=99 (partial, tr_ratio=0.96) vs epoch=799 (Ana's full 800-epoch run).
AUC = area under fraction-of-frames-within-D curve, integrated 0→45 m. avg_err over all frames.

| Mode         | ep99 avg_err | ep99 AUC | ep799 avg_err | ep799 AUC | delta     |
|--------------|-------------|----------|--------------|-----------|-----------|
| encoder      | 18.0 m      | 0.617    | **13.9 m**   | **0.703** | **−4.1 m** |
| start_gt_1   | 17.0 m      | 0.637    | 18.0 m       | 0.616     | +1.0 m    |
| start_zero   | 17.0 m      | 0.637    | 18.0 m       | 0.616     | +1.0 m    |
| start_gt_2   | crash        | —        | crash        | —         | —         |

- `start_gt_2` crashes both epochs: `UnboundLocalError` in `scheduled_2branch.py:224`
  (`pred_dec_softmax` referenced before assignment). Bug needs fixing in issue #23.
- ep99 `start_gt_1` == `start_zero`: expected — tr_ratio=0.96 means decoder was nearly
  fully teacher-forced; without teacher input both modes collapse to the same behaviour.
- ep799 decoder modes (start_gt_1 / start_zero) show no improvement over ep99:
  the decoder is not generalizing from synthetic to real sessions.

**Key finding**: The encoder (which uses GT trajectory context) improves significantly
(−4.1 m, AUC +0.086). The decoder cold-start does not improve. This confirms the
synthetic→real domain gap is the bottleneck, not model capacity. The fabrication
improvements in Layer 1 (graph paths, typed noise, expanded library) directly target this.

Heatmap images extracted to `outputs/heatmaps_ep799/` — 16 PNGs across 4 sessions × 4 modes.
Encoder mode shows prediction tracking GT trajectory; decoder cold-start prediction is
pinned to a single corner of the map (zero signal from VIO in unseen real sessions).

### Infrastructure Changes (2026-04-05)
- `<path>/` directory renamed to `runs/` — `niloc/config/io/default.yaml` updated accordingly.
- Ana's hardcoded Linux paths (`/home/anastasia/...`) fixed in extracted hydra configs to
  relative paths (`outputs/fabricated/avalon_2nd_floor`).
- `models/avalon_2nd_floor_syn/test_ckpts.txt` updated to include epoch=799 alongside epoch=99.
- Hydra routing note: `evaluate.py` writes results to `outputs/YYYY-MM-DD/HH-MM-SS/runs/models/...`
  because Hydra changes the cwd before running. Results for this session are in `outputs/2026-04-05/`.

---

## Fabricated vs Real VIO Validation (issue #29)

### Motivation
Ep799 encoder improved −4.1 m vs ep99 (training is working), but decoder cold-start shows
no improvement — it pins to one corner of the map regardless of VIO input. This is
consistent with a synthetic→real domain gap in the velocity sequence features, not a
model capacity problem. Before continuing the fabrication sprint, the gap needs to be
quantified so fixes target the right layer.

### Validation plan (four layers)

**Layer 1 — Raw trajectory statistics**
Compare GT-derived quantities between fabricated (`outputs/fabricated/avalon_2nd_floor/`)
and real (`outputs/niloc_input_1hz/`) sessions:
- Speed distribution (px/s and m/s)
- Heading change distribution (turn rate per step)
- Path length distribution
- Spatial coverage heatmap overlaid on floorplan

**Layer 2 — VIO noise characteristics**
Compare injected noise segments against real VIO residuals:
- Drift magnitude over time (metres from GT)
- Drift direction bias and isotropy
- Heading error distribution

**Layer 3 — NILOC input features (velocity sequences)**
Load both sets through `VelocityGridSequence` and compare windowed feature tensors:
- Mean and variance of vx/vy per window
- Window-level speed and heading distributions
- Feature-space PCA/t-SNE coloured by source

**Layer 4 — Spatial coverage**
- Plot GT paths for fabricated vs real sessions on the floorplan
- Quantify walkable cells touched by at least one path
- Flag systematic over/under-representation vs the graph-based uniform target

### Results (2026-04-05, all 800 fabricated sessions vs 5 real sessions)

Script: `preprocess/synthetic_data/validate_fab_vs_real.py`
Plots: `outputs/validation/fab_vs_real/`

**Layer 1 — Speed is the dominant mismatch**

| Metric | Fabricated GT | Real VIO |
|--------|--------------|---------|
| Mean step speed | **1.38 m/s** | **0.55 m/s** |
| Speed std | 0.17 m/s | 0.26 m/s |
| p5 speed | 1.24 m/s | 0.05 m/s |
| p95 speed | 1.54 m/s | 0.89 m/s |
| Mean path length | 104 m | 129 m |

Fabricated paths run at **2.5× real walking speed**. The source GT paths
(`niloc/data/avalon/synthetic_output/floorplan_avalon_*.txt`) were generated
by a simulator running agents at ~14 px/s (1.4 m/s). Real indoor walking
is 5–6 px/s (0.5–0.6 m/s). This is the primary domain gap.

**Layer 2 — VIO noise (fabricated only)**
- Final-frame drift: mean=25.2 m, p95=62 m (relative to fast GT paths).
- Real sessions shipped without GT (RoNIN VIO-only), so Layer 2 cross-comparison
  is not possible from current data. Collecting sessions with ARKit GT via
  niloc-collector would enable this comparison.

**Layer 3 — VIO velocity features mirror the speed gap**

| Metric | Fabricated VIO | Real VIO |
|--------|---------------|---------|
| Mean step speed | **1.55 m/s** | **0.55 m/s** |
| Speed p95 | 2.60 m/s | 0.89 m/s |
| Mean vx | −0.009 m/s | −0.035 m/s |
| Mean vy | +0.004 m/s | −0.032 m/s |

The velocity sequences the model trains on are centred around 1.55 m/s; at
inference the model receives sequences around 0.55 m/s — a completely
different magnitude. This directly explains why the decoder cold-start pins
to a corner: the VIO input at test time is outside the model's training
distribution.

**Decision gate outcome: distributions are incompatible — fix speed first**
- Layer 1 and 3 are both dominated by the speed mismatch.
- The graph path generator (issue #16) was already calibrated to `avg_speed_px_s=5.0`
  (0.5 m/s), which matches the real sessions. Regenerating fabricated data using
  graph paths (issue #1b) is the immediate fix.
- Issue #18 (IMUDiffusion) should proceed in parallel but a retrain on speed-
  corrected paths is required before drawing conclusions about noise quality.

### Fix applied (2026-04-05, issue #1b)

Graph-based dataset regenerated at `outputs/fabricated/avalon_2nd_floor_graph/`
using `configs/fabricate_avalon_graph.yaml`. Validation against real sessions:

| Metric | Old (density-map) | New (graph) | Real VIO |
|--------|------------------|-------------|---------|
| GT step speed | 1.37 m/s | **0.50 m/s** | 0.55 m/s |
| VIO step speed | 1.55 m/s | **0.90 m/s** | 0.55 m/s |

GT speed now matches. Remaining VIO gap (0.90 vs 0.55) is noise drift on top
of correct GT speed — the noise segments themselves run at their recorded speed
regardless of the path speed. This is the next thing to investigate (issue #18).

Ana should retrain on `outputs/fabricated/avalon_2nd_floor_graph/` using
`configs/dataset/avalon_2nd_floor_syn.yaml` pointing at the new directory.

---

## Axis-Swap Bug in Graph Path Pipeline (2026-04-13)

### Discovery
First attempt to train on the graph-fabricated dataset crashed inside Lightning
with a CUDA scatter `index out of bounds` assert from `base_models.py:125`, where
GT cell indices are scattered into a `[batch, grid.elements, seq]` tensor. Grid
elements = 90831 (= 411 × 221).

### Root cause — three separate bugs compounding

**1. Coordinate order in `graph_path_generator.generate_paths`**
The generator emitted trajectories as `(ts, row, col, row, col)` because graph
nodes are stored as `{row, col}`. But the trainer's dataset loader
(`niloc/data/dataset_velocity_reloc.py:70`) computes cell index as
`x * grid_dim[-1] + y` with `grid_dim = [411, 221]`, i.e. stride 221 — so the
first coordinate must be the **horizontal** (col, 0..411) and the second the
**vertical** (row, 0..221). The generator was emitting them swapped, putting
`col ∈ [0, 411]` into the 221-range slot.

**2. Clip off-by-one in `dataset_velocity_reloc.py:66-68`**
```
x_coord = np.clip(x_coord, 0, self.grid_dim[0])       # allowed 411
y_coord = np.clip(y_coord, 0, self.grid_dim[1])       # allowed 221
targets = x_coord * self.grid_dim[-1] + y_coord
```
With the clip permitting the end value itself, `targets` could reach
`411 × 221 + 221 = 91052 > elements (90831)`. Silently caps should be
`grid_dim[k] - 1`.

**3. B-spline overshoot in `graph_path_generator._fit_and_resample`**
`splev` with `u_uniform` occasionally extrapolates ~1 cell past the waypoint
envelope, producing GT points well outside the floorplan. Per-file sampling
showed one path with `row ∈ [−128, 152]` and `col ∈ [138, 559]`.

### Why it was latent before
The **old density-map sim paths in `niloc/data/avalon/synthetic_output/`
also had the axes swapped** — column 1 (labelled `smooth_x` in the header) was
in the `[40, 180]` range (a row), and column 2 (`smooth_y`) was in `[50, 335]`
(a col). The off-by-one clip in the dataset loader silently folded the
overflow onto the grid wall at `y=221`, so 100% of the training data was
implicitly being projected onto a 411 × 221 grid along the wrong axis.
Training still ran — it just trained on axis-scrambled targets. This is
consistent with the "decoder cold-start pins to a single corner" symptom
documented in the 2026-04-05 baseline evaluation above. The encoder could
still learn coarse priors because the scrambling was spatially consistent,
but the decoder never learned a correct map.

### Fix
- `preprocess/synthetic_data/graph_path_generator.py`: emit
  `(ts, col, row, col, row)` instead of `(ts, row, col, row, col)`; clamp
  `rows ∈ [0, H-1]` and `cols ∈ [0, W-1]` after spline evaluation to kill
  overshoot.
- `niloc/data/dataset_velocity_reloc.py:66-68`: clip upper bound to
  `grid_dim[k] - 1` instead of `grid_dim[k]`.
- Re-fabricated `outputs/fabricated/avalon_2nd_floor_graph/` with the fixes.
  0/61802 GT frames out of bounds after the fix (was 33995/61802, 55%).

### Implication
All previous runs on this codebase trained on axis-scrambled targets. The
2026-04-13 retrain is the first run with correct targets, and the first run
that should produce a decoder capable of learning a real floorplan map.

---

## 2026-04-13 Retrain on Fixed Graph Dataset

### Training setup
- Hardware: RTX 3070 Laptop (8 GB, 91 W TDP), WSL2, PyTorch 2.8.0+cu128
- Dataset: `outputs/fabricated/avalon_2nd_floor_graph/` (800 trajectories,
  post axis-fix)
- 800 epochs, 22,703 windows, 3h 48m wall time
- Checkpoint dir: `outputs/2026-04-12/23-25-31/runs/models/avalon_2nd_floor_syn/version_0/`

### Throughput optimisations (vs default config)
| Change | File | Effect |
|---|---|---|
| TF32 matmul precision "high" | `niloc/trainer.py` | Free ~20–30% on Ampere |
| `pin_memory=True, persistent_workers=True, drop_last=True` | `niloc/data/niloc_datamodule.py` | Stops worker re-fork per epoch, stable batch shape |
| `data.batch_size=32 → 256` | `train_synthetic.sh` | 8× samples/step, ~3.5 GB VRAM |
| `train_cfg.lr=0.0003 → 0.0004` | `train_synthetic.sh` | Conservative scaling for larger batch |
| `train_cfg.num_workers=8 → 12` | `train_synthetic.sh` | Matches 16-core host |

Pre-optimisation: 47 s/epoch, 37 % GPU util, 700 MB VRAM.
Post-optimisation: **19 s/epoch, 75 % GPU util (bursting to 96 %), 3.7 GB VRAM**,
power-limited at peak. Total run time dropped from a projected ~10.4 h to 3.8 h.

### Failed attempt (first try)
Initial optimisation pass used `lr=0.00085` (√8 scaling) and
`cudnn.benchmark=True`. Loss went NaN at epoch 113 — forward-pass overflow in
the 90,831-class softmax under TF32 once logits drifted large. Rolled back to
`lr=0.0004` and disabled `cudnn.benchmark` (the variable last-batch shape was
causing kernel retuning). Retry ran the full 800 epochs without incident.

### Loss trajectory

| ep | enc | dec | total | tr | lr |
|---|---|---|---|---|---|
| 0 | 11.42 | 11.42 | 11.42 | 1.00 | 1.3e-5 |
| 100 | 10.41 | 9.15 | 9.78 | 0.96 | 4.0e-4 |
| 200 | 10.29 | 8.89 | 9.59 | 0.76 | 3.0e-4 |
| 300 | 10.22 | 8.92 | 9.57 | 0.56 | 9.5e-5 |
| **457** (min dec) | 10.19 | **8.13** | 9.28 | ~0.26 | ~5e-6 |
| 500 | 10.19 | 8.67 | 9.43 | 0.16 | 1.7e-6 |
| 600 | 10.20 | 8.78 | 9.49 | 0.00 | 1.3e-7 |
| 799 | 10.19 | 8.48 | 9.34 | 0.00 | 3.0e-8 |

Last 50 epochs: dec mean 8.64 ± 0.20 (stable, not improving).

### Scheduler-monitor bug (latent)
`train_synthetic.sh` sets `train_cfg.scheduler.monitor=train_enc_loss_epoch`
for fabricated runs (because no val split exists). But the encoder loss
plateaus at ~10.2 by epoch 40 and never moves again — the encoder's job is
coarse spatial priors, it converges fast and stops. `ReduceLROnPlateau` with
`patience=10, factor=0.75` saw a permanently non-improving metric and kept
cutting LR every 10 epochs. By epoch 600 the LR was 1.3e-7, effectively zero,
and the decoder was frozen for the final ~300 epochs.

The **best decoder checkpoint was epoch 457 (`dec_loss=8.13`)**, not epoch 799
(`dec_loss=8.48`). The model ran for 343 epochs with essentially zero
learning rate after hitting its best state.

This bug is present in `train_synthetic.sh` on main — it almost certainly
impacted Ana's 2026-04-05 baseline run too, which had `epoch=799` as the
final checkpoint with `train_enc_loss_epoch=5.27`. That run used the old
density-map data (different loss scale) so the absolute numbers differ, but
the schedule mechanics are identical: encoder plateau → monitor stuck → LR
crushed → decoder under-trained.

**Fix (pending)**: monitor `train_dec_loss_epoch` instead, or switch to
cosine decay. Worth a follow-up retrain after the epoch-457 model is
validated against real sessions. Tracked separately.

### Comparison to 2026-04-05 baseline
The 2026-04-05 baseline (Ana's run, density-map paths, axes scrambled) reported
decoder cold-start pinned to a corner on real sessions. This retrain's
decoder loss descended meaningfully during the `tr_ratio` decay window
(epochs 150–450) instead of flat-lining — the first indication that with
correct targets the decoder actually learns a map. Whether that translates
to real-session accuracy is the next validation step.

### Open issues filed
- #30 — Enhance training progress logs (expose decoder loss and ETA in
  the progress bar and checkpoint filenames, so the encoder plateau stops
  masking decoder progress in casual observation).

---

## Sanity Evaluation of 2026-04-13 Retrain (in-distribution)

### Setup
- Checkpoints: `epoch=459-tr_ratio=0.2` (closest to `dec_loss` minimum at 457)
  and `epoch=799-tr_ratio=0.0` (final)
- Test set: 20 fabricated trajectories drawn from the training set (no held-out
  val/test split exists for fabricated data yet)
- Script: `niloc/cmd_test_file.py` via `models/avalon_2nd_floor_syn/sanity_ckpts.txt`
- Real-session eval is blocked until the `outputs/niloc_input_1hz/*_resnet.txt`
  files are transferred from Pablo's other laptop.

### Aggregate metrics (fraction within N metres, all 20 sessions)

| ep | mode | within 5 m | within 10 m | within 15 m | AUC (CDF 0..45 m) | E[err] |
|---|---|---|---|---|---|---|
| 459 | encoder | 0.08 | 0.17 | 0.30 | 0.58 | 19.3 m |
| 459 | start_gt_1 | **0.20** | **0.39** | **0.62** | **0.71** | **13.5 m** |
| 459 | start_zero | 0.03 | 0.04 | 0.08 | 0.46 | 24.8 m |
| 799 | encoder | 0.09 | 0.18 | 0.31 | 0.58 | 19.2 m |
| 799 | start_gt_1 | 0.20 | 0.39 | 0.62 | 0.71 | 13.5 m |
| 799 | start_zero | 0.03 | 0.04 | 0.08 | 0.46 | 24.8 m |

The ep=459 and ep=799 rows are byte-identical for `start_gt_1` and `start_zero`
— further evidence that the LR collapse froze the decoder; the final 340 epochs
produced no parameter change in the decoder branch.

### Decoder behaviour under inspection

Spot check of the decoder trajectory files (`start_gt_1` mode at epoch 459):

```
fab_graph_0000        fab_graph_0001
ts   pred_x pred_y    ts   pred_x pred_y
10   163.0  212.0     10   292.0  209.0
20   163.0  212.0     20   292.0  209.0
30   163.0  212.0     30   292.0  209.0
40   163.0  212.0     40   292.0  209.0
50   163.0  212.0     50   292.0  209.0
60     0.0    0.0     60     0.0    0.0   ← padding artifact
```

**The decoder emits a single constant cell per session.** It is not tracking
motion frame-to-frame — every window in a session collapses to the same cell.
The aggregate "20 % within 5 m" reflects this single guess occasionally landing
near the GT path, not trajectory following. The trailing `(0, 0)` frame is a
padding / window-boundary artifact in `get_output_trajectory` (to be filed).

### What this means

**The axis-swap fix worked, but not to the degree I hoped.** Compared to the
2026-04-05 baseline, two changes are measurable:

1. **No global corner pinning.** In the baseline, every session's decoder
   prediction collapsed to a single shared global cell. Here each session
   produces a different static prediction (163,212 vs 292,209), and both
   `y`-coordinates are valid (~210 within the 221-high floor) rather than
   scrambled. The targets are finally being interpreted on the correct axes.
2. **`start_gt_1 ≠ start_zero`.** In the baseline they were identical. Here
   the decoder responds differently to GT-conditioned vs cold inputs, which
   means the `start_gt` signal is at least reaching the network.

However, the model is still effectively a per-session grid classifier, not a
trajectory decoder. Root cause is almost certainly the **scheduler-monitor bug**
documented above: `ReduceLROnPlateau` locked onto the plateaued encoder loss
and crushed LR from 4e-4 (ep 100) to 1.3e-7 (ep 600). The decoder got ~300
epochs of meaningful training out of a nominal 800. `dec_loss = 8.13`
corresponds to ~3 × uniform mass on the correct cell — that's coarse grid
classification, not fine trajectory decoding.

### Next steps (priority order)

1. **Retrain with scheduler monitoring the decoder** (or total) loss instead
   of the plateaued encoder loss. Keep batch 256, lr 0.0004, TF32, all
   throughput wins. Add a "best by dec_loss" checkpoint callback so we stop
   guessing which epoch to eval. Expected cost: ~3.8 h.
2. **Fix `get_output_trajectory` padding artifact** — the trailing `(0,0)`
   frame inflates error metrics and confuses visual comparisons.
3. **Pull real VIO sessions over from Pablo's other laptop** so the
   post-retrain eval is apples-to-apples against the 2026-04-05 baseline
   numbers (which were computed on real sessions, not in-distribution fabs).
4. **Create a proper val/test split** in the fabricated dataset generator so
   sanity evaluation isn't trained-on data.

Heatmap sanity visual: `outputs/validation/sanity_ep459/heatmap_grid_ep459.png`
— 3 sessions × 3 modes, GT (green) vs pred (red) vs VIO input (cyan dotted)
on the floorplan.

---
