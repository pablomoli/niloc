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

### Noise Library (as of fabrication-sprint branch)
- 1,573 segments from universityA + universityB + officeC
- Stored in metres, DPI-agnostic (issue #14 fix)
- Window: 150 s @ 1 Hz

### Current Training Data
- 800 fabricated trajectories, 5× noise augmentation
- Paths from density-map A* (biased toward historically walked corridors)
- Ana's 800-epoch retrain in progress (started ~2026-04-04)

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
