"""
Generate walkability masks from trajectory data files.

Scans all trajectory files (.txt or .hdf5) in a data directory, converts
ground truth positions to grid cell indices (matching VelocityGridSequence),
marks visited cells, then dilates the mask to add a safety margin. The
resulting boolean mask has shape (grid_elements,) where True = walkable.
"""

import argparse
import glob
import logging
import os

import numpy as np
from scipy.ndimage import binary_dilation

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def _mark_positions(mask_2d: np.ndarray, gt_pos: np.ndarray,
                    bounds: np.ndarray, cell_length: float) -> None:
    """Mark grid cells visited by a trajectory on the 2D mask (in-place)."""
    h, w = mask_2d.shape
    pos = gt_pos.copy()
    pos[:, 0] -= bounds[0]
    pos[:, 1] -= bounds[2]
    pos /= cell_length

    x_coord = np.clip(np.round(pos[:, 0]).astype(int), 0, h)
    y_coord = np.clip(np.round(pos[:, 1]).astype(int), 0, w)

    valid = (x_coord < h) & (y_coord < w)
    mask_2d[x_coord[valid], y_coord[valid]] = True


def generate_mask(data_dir: str, grid_size: tuple, bounds: tuple,
                  cell_length: float = 1.0, dilation: int = 2) -> np.ndarray:
    """
    Generate a walkability mask from trajectory files.

    Supports two data formats:
    - .txt files: columns [ts, vio_x, vio_y, gt_x, gt_y]
    - .hdf5 files: uses computed/aligned_pos (shape [N, 2])

    Args:
        data_dir: Path to directory containing trajectory files.
        grid_size: (height, width) of the grid.
        bounds: (x_min, x_max, y_min, y_max) grid bounds.
        cell_length: Distance unit conversion factor.
        dilation: Number of binary dilation iterations to expand walkable area.

    Returns:
        1D boolean mask of shape (height * width,). True = walkable.
    """
    h, w = grid_size
    mask_2d = np.zeros((h, w), dtype=bool)
    bounds = np.asarray(bounds)

    # Try .txt trajectory files first
    txt_files = sorted(glob.glob(os.path.join(data_dir, "*.txt")))
    txt_files = [f for f in txt_files
                 if os.path.basename(f) not in ("train.txt", "val.txt", "test.txt")]

    if txt_files:
        log.info(f"Found {len(txt_files)} .txt trajectory files")
        for fpath in txt_files:
            try:
                data = np.loadtxt(fpath)
                _mark_positions(mask_2d, data[:, 3:5], bounds, cell_length)
            except Exception as e:
                log.warning(f"Skipping {fpath}: {e}")
    else:
        # Fall back to HDF5 files using computed/aligned_pos
        import h5py
        hdf5_files = sorted(glob.glob(os.path.join(data_dir, "*.hdf5")))
        if not hdf5_files:
            raise FileNotFoundError(
                f"No trajectory .txt or .hdf5 files found in {data_dir}")
        log.info(f"Found {len(hdf5_files)} .hdf5 files (no .txt trajectories)")
        for fpath in hdf5_files:
            try:
                with h5py.File(fpath, "r") as f:
                    if "computed" in f and "aligned_pos" in f["computed"]:
                        gt_pos = f["computed"]["aligned_pos"][:]
                        _mark_positions(mask_2d, gt_pos, bounds, cell_length)
            except Exception as e:
                log.warning(f"Skipping {fpath}: {e}")

    walkable_before = mask_2d.sum()
    if dilation > 0:
        mask_2d = binary_dilation(mask_2d, iterations=dilation)
    walkable_after = mask_2d.sum()

    total = h * w
    log.info(
        f"Walkability mask: {walkable_before} -> {walkable_after} / {total} cells "
        f"({100 * walkable_after / total:.1f}%)"
    )

    return mask_2d.flatten()


def save_mask(mask: np.ndarray, path: str) -> None:
    np.save(path, mask)
    log.info(f"Saved mask to {path}")


def load_mask(path: str) -> np.ndarray:
    return np.load(path)


def main():
    parser = argparse.ArgumentParser(description="Generate walkability mask from trajectory data")
    parser.add_argument("--data_dir", required=True, help="Directory with .txt trajectory files")
    parser.add_argument("--grid_h", type=int, required=True, help="Grid height")
    parser.add_argument("--grid_w", type=int, required=True, help="Grid width")
    parser.add_argument("--bounds", type=float, nargs=4, required=True,
                        help="Grid bounds: x_min x_max y_min y_max")
    parser.add_argument("--cell_length", type=float, default=1.0)
    parser.add_argument("--dilation", type=int, default=2, help="Dilation iterations")
    parser.add_argument("--output", required=True, help="Output .npy path")
    args = parser.parse_args()

    mask = generate_mask(args.data_dir, (args.grid_h, args.grid_w),
                         tuple(args.bounds), args.cell_length, args.dilation)
    save_mask(mask, args.output)


if __name__ == "__main__":
    main()
