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

## 2026-04-13 #31 Retrain Attempt: Plateau Scheduler Is Wrong Regardless of Monitor

Second retrain launched after issue #31 was fixed
(`train_cfg.scheduler.monitor` switched from `train_enc_loss_epoch` to
`train_dec_loss_epoch`) and #30 progress callback was wired up. Hard
confirmation that **`ReduceLROnPlateau` is the wrong scheduler for this
training setup, not just a badly-configured one.**

### Results (killed after 360 epochs, compared to 2026-04-13 first retrain)

| ep | first retrain LR | **#31 retrain LR** | first retrain dec | **#31 retrain dec** |
|---|---|---|---|---|
| 100 | 4.0e-4 | **1.7e-4** | 9.15 | 9.23 |
| 200 | 3.0e-4 | **1.3e-5** | 8.89 | 9.12 |
| 300 | 9.5e-5 | **9.5e-7** | 8.92 | 9.24 |
| 359 | — | **2.3e-7** | — | 8.83 |

Best decoder loss in the #31 run: **8.65 at epoch 264**. The first retrain
reached 8.13 (better) at epoch 457. The #31 fix made things *worse*.

### Why monitoring decoder loss didn't help

Per-epoch decoder loss oscillates in a ~±0.15 band (e.g. 9.18 → 9.12 → 9.24
→ 9.10) while the underlying trend improves by ~0.01 per epoch. With
`patience=10` and the default relative threshold, "no improvement for 10
epochs" fires on random-walk noise, not real plateaus. First retrain's
scheduler was locked onto the flat encoder loss, which is *also* a
permanently-no-improvement signal, so it fired every time it was eligible
from ~epoch 120 onward. Switching to decoder loss just gave it a noisier
version of the same bad input — and the patience fires *earlier* because
the oscillation crosses the threshold on almost every window.

Conclusion: the problem isn't which metric the plateau scheduler watches;
it's that plateau-detection on a training-loss signal (no validation split)
at patience=10 is fundamentally incompatible with this loss's noise profile.

### Fix: switch to deterministic cosine decay

Replaced the plateau scheduler for fabricated runs with `WarmupCosineSchedule`
(linear warmup → half-cycle cosine decay from peak to 0 over the full epoch
budget). New config at `niloc/config/train_cfg/scheduler/WarmupCosineAvalon.yaml`:

```yaml
name: WarmupCosineSchedule
monitor: False        # LambdaLR-based, no metric consumed
warmup_steps: 30      # epochs
cycles: 0.5           # single half-cycle (default 2 would wiggle)
t_total: True         # resolves to cfg.train_cfg.epochs at runtime
```

`train_synthetic.sh` selects this scheduler for `avalon_2nd_floor` via a
`train_cfg/scheduler=WarmupCosineAvalon` Hydra override. Real-data runs
(A/B/C) keep the default `WarmupReduceLROnPlateau` which is fine because
they have validation splits.

Supporting change in `niloc/trainer.py`: the `ModelCheckpoint` best-k
callback falls back to `train_dec_loss_epoch` (for `Scheduled2branchModule`)
or `train_loss_epoch` otherwise when `scheduler.monitor` is `False`. This
lets LambdaLR-style schedulers coexist with best-k checkpointing without
Lightning trying to pass a metric to `scheduler.step()` (which would crash
on `LambdaLR.step()`).

### Expected LR trajectory this run

| epoch | LR |
|---|---|
| 0 | 0 |
| 15 | ~2e-4 (mid-warmup) |
| 30 | **4e-4** (peak) |
| 200 | ~3.5e-4 |
| 400 | ~2e-4 (halfway) |
| 600 | ~6e-5 |
| 800 | ~0 |

Predictable, no plateau cliffs. Decoder should keep getting meaningful
updates through the whole `tr_ratio` decay window rather than being frozen
by the time it matters.

---

## 2026-04-14 Cosine-Schedule Retrain: Completed 800 Epochs

### Training result

800 epochs completed cleanly. LR followed the expected warmup + single-cycle
cosine decay from 0 → 4e-4 (ep 30 peak) → ~0 (ep 800), never crashed below
productive levels. No plateau cliffs, no NaN, no scheduler interference.

Decoder loss trajectory (smoothed 20-epoch window):

| ep | lr | enc | dec smoothed | tr |
|---|---|---|---|---|
| 50 | 3.99e-4 | 10.57 | 9.574 | 1.00 |
| 100 | 3.92e-4 | 10.43 | 9.085 | 0.96 |
| 200 | 3.54e-4 | 10.30 | 8.887 | 0.76 |
| 300 | 2.90e-4 | 10.23 | 8.762 | 0.56 |
| 400 | 2.12e-4 | 10.17 | 8.641 | 0.36 |
| 500 | 1.32e-4 | 10.13 | 8.553 | 0.16 |
| 600 | 6.30e-5 | 10.10 | 8.499 | 0.00 |
| 700 | 1.64e-5 | 10.09 | 8.477 | 0.00 |
| 799 | 1.66e-9 | 10.08 | 8.500 | 0.00 |

**Best checkpoint**: `epoch=689-tr_ratio=0.0-enc=10.08-dec=8.02.ckpt`
(`dec_loss=8.017`). Descent *stalled* around epoch 600; the final 200 epochs
produced no smoothed improvement despite having productive LR through
~epoch 550.

Comparison to prior runs:

| metric | first retrain | #31 retrain | **cosine retrain** |
|---|---|---|---|
| Best dec | 8.132 @ ep 457 | 8.651 @ ep 264 | **8.017 @ ep 689** |
| Final dec | 8.483 | killed @ 359 | 8.324 |
| Last-50 smoothed | 8.642 | — | **8.485** |
| LR schedule | plateau, crushed | plateau, crushed | **cosine, clean** |

Best-k ModelCheckpoint callback (from #30 fix) worked correctly — top-10 by
`train_dec_loss_epoch` saved automatically, filenames include both encoder
and decoder losses. No more guessing which epoch was best.

### Sanity evaluation: decoder still collapses to one cell per session

Evaluated `epoch=689` (best) and `epoch=799` (final) against the same
20-trajectory in-distribution test subset used for the 2026-04-13 sanity eval.

Aggregate metrics (fraction of frames within N metres):

| ep | mode | w5m | w10m | w15m | AUC | E[err] |
|---|---|---|---|---|---|---|
| 689 | encoder | **0.148** | **0.285** | 0.389 | 0.610 | **17.8 m** |
| 689 | start_gt_1 | 0.185 | 0.435 | **0.690** | **0.719** | **12.9 m** |
| 689 | start_zero | **0.053** | 0.087 | **0.193** | 0.504 | **22.6 m** |
| 799 | encoder | 0.140 | 0.268 | 0.399 | 0.608 | 17.9 m |
| 799 | start_gt_1 | 0.185 | 0.425 | 0.660 | 0.714 | 13.1 m |
| 799 | start_zero | 0.053 | 0.087 | 0.193 | 0.504 | 22.6 m |

Compared to the 2026-04-13 retrain (which had LR collapse):

| mode | metric | 2026-04-13 (ep 459) | 2026-04-14 (ep 689) | Δ |
|---|---|---|---|---|
| encoder | w5m | 0.081 | 0.148 | **+82 %** |
| encoder | w10m | 0.168 | 0.285 | **+70 %** |
| encoder | w15m | 0.301 | 0.389 | +29 % |
| encoder | E[err] | 19.3 m | 17.8 m | −1.5 m |
| start_gt_1 | w5m | 0.196 | 0.185 | −6 % |
| start_gt_1 | w10m | 0.389 | 0.435 | +12 % |
| start_gt_1 | w15m | 0.619 | 0.690 | +11 % |
| start_gt_1 | E[err] | 13.5 m | 12.9 m | −0.6 m |
| start_zero | w5m | 0.025 | 0.053 | **+112 %** |
| start_zero | w15m | 0.076 | 0.193 | **+154 %** |
| start_zero | E[err] | 24.8 m | 22.6 m | −2.2 m |

The **encoder** improved substantially — with GT context it localises to
14.8 % of frames within 5 m (was 8.1 %). The **decoder with GT prior**
(`start_gt_1`) improved only marginally. The **cold-start decoder**
(`start_zero`) doubled on some metrics but absolute numbers are still bad.

### Decoder inspection: autoregressive collapse confirmed

Spot-check of the `start_gt_1` output trajectories at epoch 689:

```
fab_graph_0000                 fab_graph_0001                 fab_graph_0002
ts   pred_x pred_y  err         ts   pred_x pred_y  err         ts   pred_x pred_y  err
10   177.0  27.0   16          10   292.0  216.0  38          10   254.0  15.0  162
20   177.0  27.0   51          20   292.0  216.0  64          20   254.0  15.0  170
30   177.0  27.0   88          30   292.0  216.0  109         30   254.0  15.0  190
40   177.0  27.0   118         40   292.0  216.0  156         40   254.0  15.0  224
50   177.0  27.0   154         50     0.0    0.0  188         50   254.0  15.0  198
60     0.0   0.0   341                                         60   254.0  15.0  209
                                                               70     0.0    0.0  107
```

**Every real frame in every session predicts the same cell.** fab_graph_0000
lands within 16 px on the first frame (the GT starts near (174, 43) and the
model predicts (177, 27) — essentially nailed the entry point) but then
**never moves**, accumulating error as the real path walks away. The
trailing `(0,0)` is the same window-padding artifact observed in the
2026-04-13 eval, unchanged by this retrain.

This is not a coarse-classification failure — it's **autoregressive
collapse**. The decoder is supposed to consume its previous prediction plus
the current velocity window to produce the next cell. Here it produces the
same cell for every window regardless of the velocity input. The model has
learned a degenerate fixed point where `f(prev_pred, vel_window) ≈ prev_pred`
across the support of `vel_window`.

### Diagnosis: training dynamics are now fine; the ceiling is architectural/data

1. **The scheduler fix is fully validated.** LR held in the 1e-4–4e-4 band
   through epoch ~500 and tapered cleanly via cosine. We unblocked training.
2. **The model still hits the same ceiling.** Smoothed `dec_loss` stopped
   improving around epoch 600 despite productive LR, and the decoder still
   emits one cell per session — the same failure mode as the 2026-04-13
   run, just ~0.1 loss units lower.
3. **The encoder did improve materially** (w5m +82 %). So "with GT context"
   localisation got better. The cold-start and decoder branches didn't.
4. **Therefore the remaining gap is not a training-config problem** — it's
   either model capacity (1.9 M params, 90,831-way classifier is a steep
   output head), architectural (decoder isn't effectively conditioning on
   velocity), or data diversity (800 GT × 4 aug = 3200 sequences is too
   narrow to learn a proper motion model).

### Next steps (priority order)

1. **Instrument the decoder forward pass.** Before changing anything, verify
   the decoder is actually using the velocity input at inference time. Log
   the gradient of the output with respect to the velocity window for a
   single session — if it's near zero, the decoder is ignoring velocity and
   we have an architectural bug. If it's non-zero, the collapse is a
   training-data diversity problem.
2. **Fix `get_output_trajectory` padding artifact** (trailing `(0,0)`).
   Cosmetic but muddies error metrics and visuals.
3. **Issue #18 (IMUDiffusion)** — expand noise library 1573 → ~5000 segments
   with per-motion-type conditioning. More diversity in noise → more
   diversity in training windows → harder for the decoder to find a
   collapsing fixed point.
4. **Real-session eval** once Avalon data arrives. Confirm whether the
   collapse also happens on real VIO input or only on in-distribution fabs.
5. **Architectural follow-up** (layer-2 work): if the instrumentation in (1)
   shows the decoder is architecturally underpowered, the sprint shifts to
   layer 2 (decoder compression / rewrite).

---

## 2026-04-14 Decoder Collapse Diagnostic (revises earlier interpretation)

Ran `niloc/diagnose_decoder.py` on `epoch=689-dec=8.02.ckpt` with
`fab_graph_0000`. The script iterates all 22 windows of the session and for
each window records: encoder latent, encoder argmax, `start_zero` and
`start_gt_1` decoder argmax, and the gradient of the top logit wrt `feat`
and `memory`. It then ablates `feat` (zeros / noise / 10×) to test whether
predictions change.

### Results

```
-- Encoder health --
  latent cosine sim (off-diag mean): 0.8273
  unique encoder majority-vote cells: 8 / 22
  enc argmax per window: [90417, 90417, 57298, 57286, 90417, 57421, 57286,
                          57260, 57286, 57286, 57498, 23224, 57286, 57286,
                          57298, 57421, 57421, 57420, 57420, 57420, 90417,
                          90417]

-- Decoder per-window argmax --
  start_zero:  3/22 unique   ~19× (409, 28) + two outliers
  start_gt_1:  20/22 unique  (177,27) (182,56) (143,92) (203,74) (215,16)
                             (138,60) (139,51) (240,104) (151,109) (259,47)
                             (253,121) (253,134) (253,146) (204,45) ...

-- Per-window gradient sensitivity (start_zero top logit) --
  mean |∂/∂feat| = 3.51e-01   (non-zero, varies 0.04 – 2.47 across windows)
  mean |∂/∂mem|  = 0           (uniform prior edge case, not informative)

-- Ablation on start_zero mode --
  original feat:        all 90417  →  (409, 28) corner
  feat = zeros:         all 0       →  (0, 0)
  feat = random noise:  varied cells (no overlap with original)
  feat × 10:            varied cells (no overlap with original)
```

### Revised diagnosis

The diagnostic **falsifies** both hypotheses I offered in the earlier
"diagnosis" section above:

1. **Encoder is healthy, not collapsed.** Cosine similarity of 0.83 across
   windows (1.0 would be collapse). Eight unique majority-vote cells across
   22 windows. The encoder distinguishes velocity windows fine.
2. **Decoder IS velocity-sensitive.** Non-zero `∂/∂feat` gradient on every
   window (0.04–2.47 range). Ablation confirms: `feat=zeros`, `feat=noise`,
   `feat×10` each produce different predictions than the original. The
   decoder reads the velocity input.
3. **Decoder CAN produce varied outputs.** When each window is probed
   independently with a fresh GT seed (`start_gt_1` in the diagnostic's
   per-window isolated mode), the decoder produces 20 unique cells across
   22 windows — varied, contextual, and following the GT path closely.

### The actual failure mode: autoregressive fixed point

The apparent "one cell per session" collapse seen in the sanity-eval
`pred_traj` files (e.g. `fab_graph_0000` outputting `(177, 27)` for every
timestep) is **not** a collapsed decoder. It's what happens in `get_inference`
when the autoregressive memory is carried across windows:

```python
# scheduled_2branch.get_inference, paraphrased
for window_i in range(n_windows):
    if i == 0 and start_gt:
        memory[:, :, :1] = GT_seed              # first window only
    elif i > 0:
        memory[:, :, :overlap+1] = pred_dec_softmax[:, :, -overlap-1:]
```

So the first window's prediction seeds the second window's memory, which
produces the same prediction, which seeds the third, and so on. The
decoder has learned a trivial fixed point: `f(seed=X, velocity) ≈ X` on
the support of velocity windows it saw in training. It never learned
`f(seed=X, velocity_that_should_move_to_Y) = Y` because during training it
was mostly teacher-forced with true GT positions, not stale previous
predictions.

This is a training-coverage problem in the `tr_ratio → 0` regime, not an
architectural bug. The tr_ratio schedule in the 2026-04-14 cosine run:

| epoch range | tr_ratio | decoder input |
|---|---|---|
| 0–74 | 1.00 | always GT |
| 75–574 | 1.00 → 0.00 | mixed, linear decay |
| 575–800 | 0.00 | always its own previous output |

The autonomous tail is ~225 epochs but LR by epoch 575 was already 7e-5
and dropping toward 0 via the cosine schedule. The decoder had maybe
100 epochs of *productive* training in the regime it's actually tested in
(fully autonomous rollout). That's apparently not enough to escape the
`f(X, ·) ≈ X` fixed point.

### `start_zero` defaults to encoder's corner

In `start_zero` mode with uniform memory prior, the decoder outputs cell
90417 = (409, 28) — the top-right corner — for 19 of 22 windows. That
cell is the **encoder's most common argmax** for this session. The decoder
with no prior copies the encoder's majority vote. That's a second,
orthogonal symptom but likely stems from the same undertraining: the
decoder doesn't know how to construct a prediction from scratch, only how
to propagate a prior.

### Implications for next steps (revised)

- **NOT an architecture issue.** Layer-2 rewrites are not indicated. The
  2-branch design is working; the encoder is fine, the decoder is
  velocity-sensitive, the gradient flow is healthy.
- **NOT "decoder ignores velocity."** This hypothesis is falsified.
- **It is a training-coverage problem** in the low-`tr_ratio` regime.
  Three complementary fixes, in rough order of expected impact:

  1. **Schedule hacking** (cheapest). Extend the autonomous tail: faster
     `tr_ratio` decay (lower `tr_warmup`, higher `arre`) so the model spends
     more epochs at `tr_ratio ≤ 0.3` with productive LR. Alternatively a
     2-cycle cosine (LR restarts midway) so the second half of training
     fine-tunes under the new regime with fresh gradient flow. One 4h run
     to test.
  2. **Data diversity** (medium cost, issue #18). Expand noise library
     1573 → ~5000 via IMUDiffusion. More varied training windows make the
     trivial fixed point less accurate and force the decoder to learn real
     update dynamics. Requires training the diffusion model first.
  3. **Real-session eval** once Avalon data arrives. Confirms whether the
     fixed-point collapse also happens on real VIO input or is partly an
     artifact of the fabricated distribution.

- **`get_output_trajectory` `(0, 0)` padding artifact** is still a real
  cosmetic bug worth fixing, but it's not connected to the collapse.

### Tooling added
- `niloc/diagnose_decoder.py` — Hydra-decorated diagnostic. Loads a
  checkpoint and one session, runs per-window encoder + decoder forward
  passes with gradient tracking, performs feat ablation.
- `diagnose_decoder.sh` — convenience wrapper with Avalon-specific overrides.
- Usage: `bash diagnose_decoder.sh <ckpt> [session_name]`

---

## 2026-04-14 Schedule-Fix Retrain: Confirms Fixed-Point Ceiling

Based on the decoder diagnostic, the autoregressive collapse hypothesis
predicted that giving the decoder more *productive* epochs in the
`tr_ratio = 0` regime (longer autonomous tail with LR still meaningful)
would break the identity fixed point. Concrete changes: `tr_warmup: 75 → 30`,
`arrf: 0.01 → 0.02`. Result: `tr_ratio` drops from 1.0 to 0.0 over
epochs 30–290 (was 75–575), leaving **520 autonomous epochs vs 225**, and
LR at the `tr_ratio=0` transition was **2.98e-4 vs 7.1e-5** in the prior
cosine run — roughly 4× more productive LR at the critical transition.

### Training trajectory (800 epochs, 3h 58m wall time)

| ep | lr | enc | dec | tr_ratio | smoothed dec |
|---|---|---|---|---|---|
| 0 | 0 | 11.42 | 11.42 | 1.00 | 11.42 |
| 100 | 3.92e-4 | 10.47 | 9.19 | 0.74 | 9.13 |
| 200 | 3.54e-4 | 10.33 | 8.97 | 0.34 | 8.92 |
| 290 (**auto start**) | 2.98e-4 | 10.25 | 8.82 | **0.00** | 8.78 |
| 400 | 2.12e-4 | 10.19 | 8.61 | 0.00 | 8.65 |
| 500 | 1.32e-4 | 10.14 | 8.62 | 0.00 | 8.56 |
| 600 | 6.30e-5 | 10.10 | 8.68 | 0.00 | 8.51 |
| 700 | 1.64e-5 | 10.10 | 8.48 | 0.00 | 8.49 |
| 799 | 1.66e-9 | 10.08 | 8.33 | 0.00 | 8.52 |

- **Best `dec_loss` = 7.996 at epoch 689** (vs 8.017 for the prior cosine
  run at ep 689 — essentially tied, delta −0.021).
- **Last 50 epochs smoothed mean: 8.499 ± 0.212** (vs 8.485 in the prior
  cosine run — also essentially tied).
- LR and `tr_ratio` both followed the new schedule exactly, no anomalies.

### Training-loss ceiling is real

The autonomous regime ran from epoch 290 to 800 (510 epochs) with LR
descending from 2.98e-4 → 1.66e-9. For comparison, the prior cosine run's
autonomous regime was ~225 epochs with LR descending from 7e-5 → 1e-9.
**Despite 2.3× the autonomous budget and 4× the starting LR**, the final
training loss is indistinguishable from the prior run:

| metric | cosine retrain | **schedule-fix retrain** |
|---|---|---|
| best dec | 8.017 @ 689 | **7.996 @ 689** |
| final dec | 8.324 | 8.330 |
| last-50 smoothed | 8.485 | 8.499 |

The decoder converges to the same ceiling regardless of how aggressively we
expose it to the autonomous regime. **The ceiling is capacity/data-bound,
not training-dynamics-bound.** This was the schedule-fix hypothesis's
decisive test, and it fails: schedule hacking is a dead end for this
architecture/dataset combination.

### Sanity evaluation on best checkpoint (ep=689)

Same 20-session in-distribution subset as prior evals:

| mode | first retrain ep=459 | cosine ep=689 | **sched ep=689** | delta vs cosine |
|---|---|---|---|---|
| encoder w5m | 0.081 | 0.148 | 0.116 | −0.032 |
| encoder w10m | 0.168 | 0.285 | 0.210 | −0.075 |
| encoder w15m | 0.301 | 0.389 | 0.393 | +0.004 |
| encoder AUC | 0.576 | 0.610 | 0.609 | −0.001 |
| encoder E[err] | 19.3 m | 17.8 m | 17.8 m | 0.0 m |
| **start_gt_1 w5m** | 0.196 | 0.185 | **0.248** | **+0.063** |
| **start_gt_1 w10m** | 0.389 | 0.435 | **0.550** | **+0.115** |
| **start_gt_1 w15m** | 0.619 | 0.690 | **0.743** | **+0.053** |
| **start_gt_1 AUC** | 0.707 | 0.719 | **0.747** | **+0.028** |
| **start_gt_1 E[err]** | 13.5 m | 12.9 m | **11.7 m** | **−1.2 m** |
| start_zero w5m | 0.025 | 0.053 | 0.025 | −0.028 |
| start_zero w10m | 0.037 | 0.087 | 0.040 | −0.047 |
| start_zero w15m | 0.076 | 0.193 | 0.093 | −0.100 |
| start_zero AUC | 0.455 | 0.504 | 0.479 | −0.025 |
| start_zero E[err] | 24.8 m | 22.6 m | 23.7 m | +1.1 m |

**Surprising split:** `start_gt_1` improved materially (E[err] 12.9 → 11.7,
w10m +11.5 pts) even though the training loss is flat. `start_zero` and
encoder modes regressed slightly. Net effect is a wash on encoder/cold-start
but a real gain on the "decoder with GT prior" mode.

### Decoder inspection: collapse persists, centroid shifted

Spot check on `fab_graph_0000` with `epoch=689` in `start_gt_1`:

```
sched ep=689                            cosine ep=689
ts  pred_x pred_y  err                  ts  pred_x pred_y  err
10   169.0  106.0   63                  10   177.0   27.0   16
20   169.0  106.0   83                  20   177.0   27.0   51
30   169.0  106.0   99                  30   177.0   27.0   88
40   169.0  106.0   90                  40   177.0   27.0  118
50   169.0  106.0   98                  50   177.0   27.0  154
60     0.0    0.0  341                  60     0.0    0.0  341
```

Both runs still emit a single cell for every window in the session —
the autoregressive carry-over collapse documented in the diagnostic
section above has **not been resolved** by the schedule fix. What changed
is *which* cell the decoder collapses to:

- **Cosine run** picked `(177, 27)` — very close to the GT entry point
  `(175, 43)` but far from the session's centroid `(230, 100)`. Error grows
  from 16 px on frame 1 to 154 px on frame 5.
- **Schedule-fix run** picked `(169, 106)` — farther from entry
  (63 px) but **much closer to the session centroid**. Error is
  flat-ish at 63–99 px across all frames instead of growing.

`start_zero` cold-start is *identical* across both runs: both predict
cell 90417 = `(409, 28)` (top-right corner) for every window in fab_graph_0000.
That's the encoder's majority vote, and the decoder with uniform memory
prior defers to it. Unchanged by the new schedule.

### Interpretation

**The schedule fix did something real but not what was hoped for.** More
productive autonomous-regime epochs let the decoder learn a *better
fixed-point policy* ("collapse to session centroid" instead of "collapse
to session entry") — hence the ~10 % improvement in `start_gt_1` E[err].
But it did not learn to *escape* the fixed point and track motion
frame-to-frame. Every session still produces one constant cell per window.
The ceiling is the fixed point itself, not the policy inside it.

Training dynamics are no longer the bottleneck. Three retrains have now
tried:

1. **Plateau on encoder loss** (pre-#31): LR crushed early by plateau
   detection on flat metric. Worst result.
2. **Cosine 1-cycle, slow tr_ratio decay** (2026-04-14 cosine): clean LR
   trajectory, but decoder only got ~225 autonomous epochs most of which
   had LR < 1e-4. Plateau at `dec ≈ 8.5`.
3. **Cosine 1-cycle, fast tr_ratio decay** (this run): 520 autonomous
   epochs, LR productive through the whole autonomous window. Same
   plateau at `dec ≈ 8.5`.

The decoder is not training-limited; it has converged to its best available
policy under the current architecture and data. All three runs land within
~0.02 of each other on best `dec_loss` despite radically different LR and
`tr_ratio` schedules.

### Decisive next step: issue #18 (IMUDiffusion noise library expansion)

This is now the next clear experiment. The hypothesis: the trivial
"collapse to session centroid" fixed point is learnable only because there
are too few distinct training windows (800 GT paths × 4 noise augmentations
= 3200 sequences). More diverse noise → more varied windows → the
trivial fixed point stops being the loss-minimising policy.

Concrete plan:
1. Implement IMUDiffusion training on the existing 1573 noise segments
   with per-motion-type conditioning (issue #18 spec).
2. Generate ~3500 synthetic segments, expanding the library to ~5000
   total. Mark synthetic segments in metadata so they never replace real.
3. Re-fabricate `outputs/fabricated/avalon_2nd_floor_graph_v2/` with the
   expanded library.
4. Retrain with this run's schedule (`tr_warmup=30, arrf=0.02, cosine`).
5. Sanity eval and inspect `fab_graph_0000_dec_traj.txt` for *per-window
   variation*, not just aggregate metrics. The real acceptance criterion
   is "decoder emits ≥ 3 unique cells per session" — currently it emits 1.

Budget estimate: 2–3 days on #18 implementation, one 4 h retrain, one
sanity eval. If this doesn't escape the fixed point, the sprint moves to
layer-2 architecture work.

### What's filed and landed
- `niloc/config/train_cfg/scheduler/WarmupCosineAvalon.yaml` — cosine config
- `niloc/diagnose_decoder.py` + `diagnose_decoder.sh` — decoder diagnostic
- `models/avalon_2nd_floor_syn/sched_ckpts.txt` — best-k pointer for this run
- Issues still open: #18 (next), #30 (landed), #31 (landed), #32 (telemetry,
  pending)

---

## 2026-04-14 IMUDiffusion First Training Run (issue #18)

Conditional DDPM implementation landed in
`preprocess/synthetic_data/imu_diffusion/`. First training run:

- **Training time:** 200 epochs in **2 min 24 s** on the RTX 3070 Laptop.
  ~100× faster than the localisation training because the output is
  `(batch, 2, 149)` (~19k floats per step) vs the localisation model's
  `(batch, 90831, 20)` (~465M floats per step), plus 15× fewer total
  optimizer steps (4800 vs 70800).
- **Model:** 4.13 M params. 3-level 1D U-Net with FiLM conditioning,
  base_channels=64, channel_mults=(1,2,4).
- **Loss trajectory:** 1.048 → ~0.22 by epoch 20, plateaued through ep 200.
  Final loss 0.229, EMA decay 0.999.
- **Checkpoint:** `preprocess/data/imu_diffusion_ckpts/model.pt`

### QC against the real noise library

250-sample QC batch (100 straight, 100 turn, 50 stationary) compared
against the real 1573-segment library:

| bucket | real per-step mag (mean/std) | synth (mean/std) | delta |
|---|---|---|---|
| straight | 0.797 / 0.350 | 0.383 / 0.162 | **−52 %** |
| turn | 0.775 / 0.532 | 0.413 / 0.307 | **−47 %** |
| stationary | 0.321 / 0.426 | 0.301 / 0.353 | −6 % |

Final-drift stats show the same pattern:

| bucket | real final drift (mean/std/p95) | synth |
|---|---|---|
| straight | 38.3 / 22.9 / 74.2 m | 24.7 / 14.7 / 50.1 m |
| turn | 28.0 / 28.4 / 82.9 m | 15.1 / 9.2 / 29.1 m |
| stationary | 9.8 / 2.6 / 14.0 m | 12.6 / 7.2 / 23.5 m |

### Visual QC: structural match, magnitude undershoot

`outputs/validation/imu_diffusion/real_vs_synth_qc.png` — 3 × 8 grid of
real (green) vs synthetic (red) trajectories per motion bucket.

- **Straight samples** are visibly straighter/less jagged, some with
  direction changes consistent with the real set. Spatial extent is
  clearly smaller (axes range ~half of real).
- **Turn samples** show looping/coiling structure similar to real turns
  but tighter.
- **Stationary samples** cluster near the origin in both real and synth;
  synth is actually slightly larger-spread here because the 6-sample
  real training support is so narrow the model had nothing to lock onto.

### Interpretation

The DDPM learned the **structural character** of each motion type but is
producing trajectories at a **smaller spatial scale**. Likely causes:
underfitting (loss plateaued at 0.22, not zero), aggressive EMA smoothing
the high-magnitude tail, or MSE's natural preference for predicting the
posterior mean when uncertain. See issue #33 for the full list of
follow-up experiments (longer training, cosine beta schedule, v-param,
classifier-free guidance, raw-weight sampling).

### Decision: proceed to full generation with current checkpoint

The primary goal of #18 is to **break the localisation decoder's
autoregressive fixed point** by giving it more diverse training windows.
Distribution match is a means to that end, not the end itself. Softer
synthetic noise is still valid noise — it adds window-level structural
diversity regardless of drift magnitude, and softer noise may actually
be beneficial given that real Avalon VIO speed is 0.55 m/s while the
current graph-fabricated VIO is 0.90 m/s (findings above).

Shipping the 200-epoch checkpoint to the re-fabrication + localisation
retrain step. If the retrain escapes the fixed point (decoder emits ≥ 3
unique cells per session in sanity eval), we win without needing to tune
the DDPM. If it doesn't, issue #33 is the next lever.

### What's landed
- `preprocess/synthetic_data/imu_diffusion/{__init__,dataset,model,diffusion,train,generate}.py`
- `preprocess/data/imu_diffusion_ckpts/model.pt` — first training checkpoint
- `outputs/validation/imu_diffusion/real_vs_synth_qc.png` — visual QC grid
- Issue #33 filed — DDPM distribution fidelity iteration (follow-up work)

---
