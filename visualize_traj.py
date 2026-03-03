import matplotlib.pyplot as plt
import numpy as np

# --- SETTINGS ---
# Use the bounds you got from map_creation.py
ORIGIN_X, ORIGIN_Y = 9.34399, 4.22964 
DPI = 2.5  # Pixels per meter (from NILoc paper; adjust if your floorplan resolution differs)

traj_path = "outputs/2026-03-02/14-45-00/<path>/models/A/logs/checkpoints/outunivA_start_zero/out/a005_2_dec_traj.txt"
map_path = "niloc/data/universityA/floorplan.png"

# Load Data
data = np.loadtxt(traj_path)

# --- OPTIONS TO TOGGLE FOR FIX ---
transform_pred = False  # Set to True if predictions need origin subtraction + scaling (i.e., if they're in meters like GT). False if already in pixel space.
flip_y = True           # Set to True if trajectories appear upside down on the map (flips y to match image y=0 at top).

# --- PROCESS COORDINATES ---
# Data columns: [time, gt_x, gt_y, pred_x, pred_y]
raw_gt_x, raw_gt_y = data[:, 1], data[:, 2]
raw_pr_x, raw_pr_y = data[:, 3], data[:, 4]

# Always transform ground truth (assumed in meters)
gt_x = (raw_gt_x - ORIGIN_X) * DPI
gt_y = (raw_gt_y - ORIGIN_Y) * DPI

# Conditionally transform predictions
if transform_pred:
    pr_x = (raw_pr_x - ORIGIN_X) * DPI
    pr_y = (raw_pr_y - ORIGIN_Y) * DPI
else:
    pr_x = raw_pr_x
    pr_y = raw_pr_y

# Load image and get dynamic size
img = plt.imread(map_path)
map_height, map_width = img.shape[:2]  # Height, width (for extent)

# Optional y-flip to align with image orientation
if flip_y:
    gt_y = map_height - gt_y
    pr_y = map_height - pr_y

# --- PLOT ---
fig, ax = plt.subplots(figsize=(12, 8))

# Use 'extent' to match pixel dimensions (y flipped if needed via above)
ax.imshow(img, cmap='gray', extent=[0, map_width, map_height, 0])

ax.plot(gt_x, gt_y, color='blue', label='Ground Truth', linewidth=1.5, alpha=0.7)
ax.plot(pr_x, pr_y, color='red', label='NILoc Prediction', linewidth=2)

ax.scatter(gt_x[0], gt_y[0], c='green', s=100, label='Start', zorder=5)
ax.set_title(f"Aligned Evaluation: a005_2")
plt.legend()
plt.show()
