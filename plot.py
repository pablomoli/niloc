import matplotlib.pyplot as plt
import numpy as np
import glob

# --- 1. SETTINGS & ALIGNMENT ---
# Change these numbers to nudge the blue line left/right or up/down
manual_x_offset = -8.5  # Adjust this (e.g., -5, -10) to fix the "right shift"
manual_y_offset = 0.0

# --- 2. PATH FINDING ---
base_search = "/home/anastasia/Desktop/Repos/niloc/outputs/2026-03-03/11-26-21/*/models/A/logs/checkpoints/outunivA_encoder/out/a005_2_enc_traj.txt"
matches = glob.glob(base_search)
pred_file = matches[0] if matches else None
gt_file = "/home/anastasia/Desktop/Repos/niloc/niloc/data/universityA/a005_2.txt"

try:
    pred = np.loadtxt(pred_file)
    gt = np.loadtxt(gt_file)

    # Use Columns 3 and 4 (the Refined Meter-Scale data)
    px, py = pred[:, 3], pred[:, 4]
    gx, gy = gt[:, 3], gt[:, 4]

    # Zero-Alignment (Both start at 0,0)
    px_zero, py_zero = px - px[0], py - py[0]
    gx_zero, gy_zero = gx - gx[0], gy - gy[0]

    # Apply the manual "Nudge"
    px_final = px_zero + manual_x_offset
    py_final = py_zero + manual_y_offset

    plt.figure(figsize=(10, 10))
    
    # Plot Ground Truth
    plt.plot(gx_zero, gy_zero, 'k--', label='Ground Truth (Real)', alpha=0.5)
    
    # Plot Niloc Prediction with the Manual Offset
    plt.plot(px_final, py_final, 'b-', label='Niloc Prediction (Aligned)', linewidth=2)

    # Highlight Start and Ends
    plt.scatter(0, 0, c='g', s=100, label='Origin (0,0)', zorder=5)
    plt.title("Niloc vs GT")
    plt.xlabel("Meters")
    plt.ylabel("Meters")
    plt.axis('equal') 
    plt.legend()
    plt.grid(True, linestyle=':', alpha=0.6)
    plt.show()

except Exception as e:
    print(f"Error: {e}")
