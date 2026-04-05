# NILOC Sprint Design: End-to-End Neural Indoor Localization

**Date:** 2026-04-05
**Author:** Pablo Molina
**Status:** Approved

---

## Overview

A four-layer sprint to take NILOC from a research prototype to a real-time iPhone demo, with each layer producing independently measurable results that form the basis of a paper.

**Team:** Solo dev (Pablo). GPU: Ana's Linux machine now, Windows laptop (arriving 2026-04-07) thereafter.

**Parallel structure:**
- **Now → April 7:** Layer 1 (fabrication). Ana's current 800-epoch run finishes untouched.
- **April 7+:** Layer 2 + 3 run together. Retrains use improved fabrication data with QAT baked in.
- **After strong model:** Layer 4. Core ML conversion + on-device inference in niloc-collector.

---

## Layer 1: Fabrication

Goal: produce richer, more spatially complete, more physically realistic synthetic training data.

### 1a. Avalon Navigation Graph Validation and Extraction

MappingForMassesMobile (a separate Polaris project) contains Avalon IMDF data including `navigable_points.geojson`, `navigation_lines.geojson`, and `graph_adjacency.json`. These were built for a different purpose and their quality is unknown. Before using them:

- Cross-check node positions against the Avalon 2nd floor floorplan image and walkability mask. Any node that falls outside the walkability mask is invalid.
- Verify edge geometry against the floorplan. Edges passing through walls are discarded.
- Confirm coordinate system: IMDF uses WGS84 (lon, lat). These need converting to floorplan pixel coordinates using the known Avalon GPS anchor and scale (dpi=10 px/m).

Output: a validated graph in pixel coordinates, serialized as a simple JSON adjacency list, stored at `preprocess/synthetic_data/data/avalon_graph.json`. If the IMDF graph is too corrupt to salvage, the graph is built from scratch by running a thinning algorithm on the walkability mask.

### 1b. Graph-Based Path Generator

Replaces the current density-map path sampling with graph-routed trajectories.

- Source/destination pairs are sampled uniformly from graph nodes, not from prior walker density. This guarantees coverage of all reachable areas.
- Paths are found via A* on the validated graph, then smoothed into continuous trajectories (cubic spline, speed profile sampled from a realistic distribution).
- Implemented in `preprocess/synthetic_data/graph_path_generator.py`, callable from the existing `fabricate.py` pipeline via a config flag.
- Output format is identical to the existing synthetic path `.txt` files — no downstream changes required.

### 1c. Motion-Typed Noise Injection

The current noise library is sampled uniformly regardless of path geometry. This injects sharp-turn drift during a straight corridor walk and vice versa, producing physically inconsistent training examples.

- At injection time, each trajectory segment is classified by motion type: straight corridor, turn (>20 deg heading change), stationary (speed < 0.3 m/s), open area.
- The noise library is pre-split into matching buckets at build time using the same classification.
- Injection samples from the matching bucket. Falls back to the full library if a bucket has fewer than 10 segments.
- Implemented as an extension to `preprocess/synthetic_data/inject_noise.py`.

### 1d. IMUDiffusion Noise Library Expansion

A DDPM trained on the existing 1573-segment noise library generates additional segments, particularly for underrepresented motion types (sharp turns, near-stationary). Runs once as a preprocessing step; output segments are stored alongside real ones and flagged as synthetic in metadata.

- Uses the IMUDiffusion architecture (arXiv 2411.02954). Implementation adapted from the open-source release.
- Conditioned on motion type label (same classification as 1c).
- Target: expand library to ~5000 segments total.
- Implemented in `preprocess/synthetic_data/imu_diffusion/`.

### 1e. Draw-Paths Web App

A local Flask app for deliberately authoring fabrication trajectories in underrepresented areas or specific motion patterns.

- Loads the Avalon floorplan image and walkability mask.
- User clicks waypoints on the floorplan canvas in the browser.
- Backend connects waypoints through the validated graph (1a/1b), smooths the path, injects noise, and exports a `.txt` file directly into `data/avalon/synthetic_output/`.
- Single-page app: HTML canvas + vanilla JS frontend, Flask backend, no build step.
- Located at `tools/drawpaths/`.

---

## Layer 2: Architecture

Goal: produce a model that is both more accurate and mobile-ready without architectural surgery that breaks compatibility with the existing training pipeline.

### 2a. Quantization-Aware Training (QAT)

Applied from the first retrain onward. PyTorch `torch.ao.quantization` QAT inserts fake quantization nodes during the forward pass so the model learns to be robust to INT8 precision. Core ML INT8 conversion from a QAT-trained model loses minimal accuracy compared to post-training quantization.

- Added as a training config flag: `train_cfg.qat: true`.
- Applied to the NILOC decoder only (RoNIN encoder weights are frozen during fine-tuning anyway).
- Implemented in `niloc/network/qat_utils.py`, hooked into `base_models.py` `configure_optimizers`.

### 2b. Decoder Compression

Structured pruning of the NILOC decoder to reduce model size for the iPhone Neural Engine.

- Target: 50% parameter reduction with less than 5% accuracy degradation.
- Uses `torch.nn.utils.prune` magnitude-based structured pruning, applied after Retrain 1 converges.
- Pruned model is then fine-tuned for 100 epochs with QAT active (this becomes Retrain 2).
- Compression ratio and accuracy tradeoff documented as part of the ablation table.

### 2c. Tartan IMU Backbone (Stretch)

Evaluate whether replacing the RoNIN backbone with Tartan IMU's pre-trained weights (CVPR 2025, open weights on HuggingFace: `raphael-blanchard/TartanIMU`) improves accuracy. LoRA adapters fine-tuned on fabricated Avalon data. Same fabricated dataset as Retrain 1 for fair comparison.

- Only pursued if training cycles are available after Retrain 2 converges.
- Result compared against Retrain 1 to isolate backbone contribution.

---

## Layer 3: Training

Goal: establish a clean ablation sequence so every accuracy improvement is attributable to a specific change.

### Retrain Sequence

| Run | Data | Architecture | Purpose |
|-----|------|-------------|---------|
| Baseline | Current fabricated (800 traj) | Current | Ana's run, untouched |
| Retrain 1 | Graph paths + typed noise + expanded library | Current | Isolates fabrication contribution |
| Retrain 2 | Same as R1 | QAT + pruned decoder | Mobile-ready model |
| Stretch | Same as R1 | Tartan IMU LoRA | Isolates backbone contribution |

All retrains: 800 epochs, same scheduler and teacher ratio decay as current run.

### Evaluation Pipeline

Metrics per retrain, reported in the ablation table:
- Absolute Trajectory Error (ATE) on held-out synthetic test set
- Localization accuracy at 1m, 3m, 5m radius
- Inference latency (ms) on device

Implemented as `niloc/evaluate_ablation.py`, runnable on any checkpoint directory.

---

## Layer 4: iPhone Inference

Goal: real-time localization running entirely on device in niloc-collector.

### 4a. Core ML Conversion Pipeline

Script at `export/convert_to_coreml.py`:
- Loads a trained checkpoint
- Traces the model with `torch.jit.trace`
- Converts via `coremltools` with INT8 weight quantization
- Validates output matches PyTorch reference within tolerance
- Exports `.mlpackage` ready to embed in Xcode

Re-runnable whenever the model improves.

### 4b. ARKit VIO → NILOC Input Mapping

The critical unknown: NILOC expects VIO features in the format produced by RoNIN from raw IMU. ARKit produces its own VIO output. These need to be compared to determine whether ARKit output feeds NILOC directly or whether a lightweight RoNIN-equivalent step is needed on device.

- Prototype: record a session with niloc-collector (which archives 100Hz raw IMU), run RoNIN offline, compare RoNIN output against ARKit VIO for the same session.
- If sufficiently similar: ARKit VIO feeds NILOC directly. No on-device RoNIN needed.
- If not: implement a minimal mobile RoNIN in Swift using Core ML (separate model export).
- This prototype is the first task in Layer 4 — its outcome gates the rest of the input pipeline design.

### 4c. Inference Tab in niloc-collector

New tab added to the existing SwiftUI app:
- User selects a building (loads floorplan + grid config, same as existing project flow)
- Calibrates anchors (reuses existing calibration workflow)
- Hits Start: app initializes ARKit session, begins feeding VIO to the Core ML model at 1Hz
- Estimated position rendered as a dot on the existing `FloorplanOverlayView`
- No ground truth recording — inference only

---

## Notes on MappingForMassesMobile Data

The Avalon IMDF data in MappingForMassesMobile is built for a different product and its geometric accuracy relative to the NILOC floorplan is unverified. All data extracted from that repo must be validated against the walkability mask and floorplan image before use in fabrication. Do not assume the navigation graph is correct — validate every node and edge explicitly (see 1a).

---

## Success Criteria

- **Layer 1:** Trajectory coverage plots show uniform spatial distribution across Avalon 2nd floor. Noise distribution by motion type is visually distinct between buckets.
- **Layer 2:** Compressed model is ≤50% the size of the original with <5% ATE degradation.
- **Layer 3:** Retrain 1 beats baseline ATE. Retrain 2 matches Retrain 1 within 5%.
- **Layer 4:** Real walk through Avalon produces a trajectory visually tracking the known path on the floorplan overlay.
