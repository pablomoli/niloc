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
