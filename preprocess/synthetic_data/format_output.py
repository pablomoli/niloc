"""
Output formatter for fabricated trajectories (issue #9).

Converts the list of dicts produced by inject_noise.fabricate() into
niloc-compatible .txt files and a train.txt split list.

File format (matches universityA reference data)
------------------------------------------------
Each .txt has a comment header followed by space-separated rows:
  # ts_seconds,x,y,gt_x,gt_y
  <ts>  <x>  <y>  <gt_x>  <gt_y>

where x = gt_x + noise_x and y = gt_y + noise_y.
x MUST differ from gt_x — never copy gt to both columns.

Coordinate convention
---------------------
gt_x = row index (dim 0), gt_y = col index (dim 1).
Noise offsets from inject_noise are applied as relative deltas and are
coordinate-convention-agnostic.

Output structure
----------------
<out_dir>/
  fab_0000.txt  fab_0001.txt  ...
  train.txt     (stem names, one per line, no extension)
  val.txt       (empty — val/test use real data only)
  summary.json  (counts, frame stats, noise magnitude)

Public API
----------
  write_dataset(results, out_dir, file_tag, freq) -> dict
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def write_dataset(
    results: list[dict],
    out_dir: Path,
    file_tag: str = "fab",
    freq: float = 1.0,
) -> dict:
    """
    Write fabricated trajectories to disk in niloc .txt format.

    Parameters
    ----------
    results  : output of inject_noise.fabricate() — list of dicts with
               keys ts, noisy_xy, gt_xy, seg_idx, gt_path_idx
    out_dir  : directory to write files into (created if absent)
    file_tag : prefix for output filenames (default "fab")
    freq     : sampling frequency used to generate timestamps (Hz)

    Returns
    -------
    summary dict with trajectory count, total frames, noise stats, bounds
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    stems: list[str] = []
    total_frames = 0
    all_drifts: list[float] = []

    for i, r in enumerate(results):
        stem = f"{file_tag}_{i:04d}"
        path = out_dir / f"{stem}.txt"

        gt_xy   = r["gt_xy"]    # (T, 2)  clean ground truth
        noisy_xy = r["noisy_xy"]  # (T, 2)  gt + noise

        T = len(gt_xy)
        ts = np.arange(T, dtype=np.float64) / freq

        # Columns: ts, x, y, gt_x, gt_y
        # x = gt_x + noise_x  (must differ from gt_x)
        data = np.stack([
            ts,
            noisy_xy[:, 0],
            noisy_xy[:, 1],
            gt_xy[:, 0],
            gt_xy[:, 1],
        ], axis=1)

        np.savetxt(path, data, header="ts_seconds,x,y,gt_x,gt_y", comments="# ")

        drift = np.linalg.norm(noisy_xy - gt_xy, axis=1).mean()
        all_drifts.append(float(drift))
        total_frames += T
        stems.append(stem)

    (out_dir / "train.txt").write_text("\n".join(stems) + "\n")
    # val and test intentionally empty — fabricated data is train-split only
    (out_dir / "val.txt").write_text("")
    (out_dir / "test.txt").write_text("")

    summary = {
        "n_trajectories":   len(results),
        "total_frames":     total_frames,
        "mean_drift_px":    float(np.mean(all_drifts)),
        "median_drift_px":  float(np.median(all_drifts)),
        "p95_drift_px":     float(np.percentile(all_drifts, 95)),
        "file_tag":         file_tag,
        "freq_hz":          freq,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    return summary


def validate_outputs(out_dir: Path, n_check: int = 10) -> list[str]:
    """
    Spot-check output files for format correctness.

    Checks a sample of files for:
    - Correct column count (5)
    - No NaN or Inf values
    - x != gt_x (noise was applied)
    - Timestamps start at 0 and are monotonically increasing

    Parameters
    ----------
    out_dir : directory written by write_dataset()
    n_check : number of files to sample

    Returns
    -------
    list of error strings; empty means all checks passed
    """
    train_txt = out_dir / "train.txt"
    if not train_txt.exists():
        return ["train.txt not found"]

    stems = [s for s in train_txt.read_text().splitlines() if s]
    if not stems:
        return ["train.txt is empty"]

    rng = np.random.default_rng(0)
    sample = rng.choice(stems, size=min(n_check, len(stems)), replace=False)

    errors: list[str] = []
    for stem in sample:
        path = out_dir / f"{stem}.txt"
        if not path.exists():
            errors.append(f"{stem}: file not found")
            continue

        data = np.loadtxt(path, comments="#")

        if data.ndim != 2 or data.shape[1] != 5:
            errors.append(f"{stem}: expected shape (T, 5), got {data.shape}")
            continue

        if not np.all(np.isfinite(data)):
            errors.append(f"{stem}: contains NaN or Inf")

        x, gt_x = data[:, 1], data[:, 3]
        if np.allclose(x, gt_x):
            errors.append(f"{stem}: x == gt_x (noise not applied)")

        ts = data[:, 0]
        if not np.isclose(ts[0], 0.0):
            errors.append(f"{stem}: timestamps do not start at 0 (first={ts[0]:.4f})")

        if not np.all(np.diff(ts) > 0):
            errors.append(f"{stem}: timestamps are not monotonically increasing")

    return errors
