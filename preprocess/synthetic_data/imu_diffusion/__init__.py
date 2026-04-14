"""
IMU diffusion — conditional DDPM for expanding the VIO noise library.

Issue #18 / L1d. Trains a small conditional 1D U-Net on the existing
noise library to generate additional synthetic segments, primarily for
underrepresented motion types (stationary, sharp turns).

Modules:
    dataset.py      — loads noise_library.npy, converts absolute trajectories
                      to per-step displacements, applies normalisation and
                      yaw-rotation augmentation.
    model.py        — conditional 1D U-Net (timestep + motion class embeddings).
    diffusion.py    — DDPM forward/reverse process (linear beta schedule,
                      epsilon parameterisation).
    train.py        — training entry point.
    generate.py     — sampling entry point; produces synthetic segments and
                      writes an expanded library alongside the real one.
"""
