# niloc-fork

## Collaboration
- This repo is shared with Ana (Anastasia Tarasenko) who runs on a Linux machine with an NVIDIA GPU.
- Pablo runs on an M3 MacBook Pro (Apple Silicon, MPS, no CUDA).

## Git
- Commit often and liberally — small, focused commits. Do not batch unrelated changes into one commit.
- Never add Claude as a contributor.

## Environment
- Managed with uv + pyproject.toml (migrated from conda niloc_env.yml).
- pytorch-lightning is pinned to 1.2.6 — do not upgrade, the Trainer API changed significantly in 2.x.
- PyTorch: on Apple Silicon install the standard wheel (MPS). On Linux+NVIDIA use the CUDA wheel from https://download.pytorch.org/whl/cu118 (or match installed CUDA version).

## Floorplan and DXF Assets

- Floorplan images live in `niloc/data/avalon/`. Prefer `detailed_floorplan.jpg` for overlays (highest detail); fall back to `floorplan.png` then the `.npy` density array.
- DXF files for all Avalon floors are at `preprocess/data/dxf files/`. The `2nd floor.dxf` is the primary reference — units are inches, local CAD frame (not geographically oriented).
- The DXF coordinate system has its building long axis along DXF-X, mapping directly to floorplan columns (no rotation needed). The 10° building rotation only applies to GPS→pixel transforms.
- Walkability masks: `floorplan.png.npy` (density-based, 41.6% coverage) vs `walkability_mask_dxf.npy` (DXF-derived, 80.3% coverage). Use the DXF mask for graph-based path generation.
- `walkability_mask_dxf_bw.png` is a clean black-and-white architectural floorplan rendered from DXF geometry.

## Research Log

- Empirical observations and decisions that should inform the paper go in `docs/findings.md`.
- Update it whenever a measurement, calibration result, or architectural decision is made.
