# Neural Inertial Localization (NILOC) - Granular Technical Explanation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Problem Statement & Approach](#problem-statement--approach)
3. [Data Pipeline Architecture](#data-pipeline-architecture)
4. [Model Architectures](#model-architectures)
5. [Training Framework](#training-framework)
6. [Evaluation System](#evaluation-system)
7. [Configuration Management](#configuration-management)
8. [Key Technical Concepts](#key-technical-concepts)

---

## Project Overview

**NILOC** (Neural Inertial Localization) is a deep learning system that localizes a device within a building using only IMU (Inertial Measurement Unit) sensor data. The system was published at CVPR 2022 and represents a novel approach to indoor localization without requiring WiFi, Bluetooth beacons, or visual sensors.

### Core Innovation
Instead of directly regressing to coordinates, NILOC treats localization as a **classification problem** over a discretized grid of the building floorplan. This transforms the continuous localization problem into predicting which grid cell the device is currently in.

---

## Problem Statement & Approach

### The Challenge
- **Input**: Raw IMU sensor data (gyroscope, accelerometer) at 200Hz
- **Output**: 2D position coordinates within a building floorplan
- **Constraint**: No external infrastructure (no WiFi, no beacons, no cameras)

### The Solution Strategy

1. **Grid-Based Classification**: The floorplan is discretized into a grid (e.g., 112×384 = 43,008 cells for building C). Instead of predicting (x, y) coordinates, the model predicts a probability distribution over all grid cells.

2. **Velocity-to-Position**: The model learns to predict position from velocity estimates derived from IMU data. The velocity is computed as the difference between consecutive position estimates from a VIO (Visual-Inertial Odometry) system during training.

3. **Dual-Branch Architecture**: The best-performing model uses two branches:
   - **Encoder Branch**: Predicts position from velocity features alone
   - **Decoder Branch**: Uses both velocity features AND position priors (previous predictions) to refine estimates

---

## Data Pipeline Architecture

### 1. Data Format (HDF5)

The dataset is stored in HDF5 format with the following structure:

```
data.hdf5
├── synced/              # Time-synchronized IMU data at 200Hz
│   ├── time            # Timestamps
│   ├── gyro            # Gyroscope readings (3D angular velocity)
│   ├── acce            # Accelerometer readings (3D linear acceleration)
│   ├── linacce         # Linear acceleration (gravity removed)
│   ├── gravity         # Gravity vector
│   ├── magnet          # Magnetometer readings
│   └── rv              # Rotation vector
├── pose/                # Ground truth from Visual SLAM
│   ├── tango_pos       # 3D positions [x, y, z]
│   └── tango_ori       # Orientations [w, x, y, z] (quaternion)
└── computed/            # Processed data
    ├── aligned_pos      # 2D positions aligned to floorplan [x, y]
    └── ronin            # RoNIN model predictions (for comparison)
```

### 2. Data Processing Pipeline

#### Step 1: Sequence Loading (`VelocityGridSequence`)
Located in `niloc/data/dataset_velocity_reloc.py`:

```python
# Key operations:
1. Load trajectory from .txt file (ts, IMU_pos, GT_pos)
2. Compute velocity: features = positions[1:] - positions[:-1]
3. Convert positions to grid indices:
   - Normalize: (pos - bounds_offset) / cell_size
   - Round to nearest integer
   - Convert 2D coords to 1D index: idx = x * grid_height + y
4. Return: features (velocity), targets (grid indices), auxiliary (time, positions)
```

**Critical Detail**: The model doesn't use raw IMU data directly. Instead, it uses **velocity estimates** computed from VIO positions. During training, these come from ground truth; during inference, they come from a pre-processing step (like RoNIN).

#### Step 2: Window Extraction (`GlobalLocDataset`)
Located in `niloc/data/dataset_velocity_reloc.py`:

```python
# Sliding window approach:
- window_size: Number of velocity frames per sample (e.g., 200 frames = 1 second at 200Hz)
- step_size: Stride between windows (e.g., 20 frames = 0.1 seconds)
- Creates overlapping windows for training
```

**Example**: With `window_size=200` and `step_size=20`, a 1000-frame trajectory generates:
- Window 1: frames 0-199
- Window 2: frames 20-219
- Window 3: frames 40-239
- ... (sliding window)

#### Step 3: Data Augmentation (`transforms.py`)

The system includes several augmentation strategies:

1. **YawDrift**: Simulates gyroscope drift by adding noise to yaw angle
2. **PerturbScale**: Adds scale noise to velocity (simulates accelerometer bias)
3. **RotateYawFeat**: Randomly rotates velocity vectors (data augmentation)
4. **ReverseDirection**: Reverses trajectory direction (doubles training data)
5. **BiasShift**: Adds bias to gyro/accel readings (IMU calibration errors)

**Why This Matters**: IMU sensors have systematic errors (bias, drift, scale factors). These augmentations help the model generalize to real-world sensor imperfections.

### 4. Data Module (`NilocDataModule`)

PyTorch Lightning's `DataModule` pattern:
- Separates train/val/test splits
- Applies different transforms per split
- Manages DataLoader creation
- Handles multi-worker data loading

---

## Model Architectures

### Architecture Factory Pattern

The codebase uses a factory pattern to construct models:

```
model_factory.py
  ├── get_model() → routes to:
  │   ├── build_transformer() → for transformer architectures
  │   └── build_seq2seq() → for LSTM/TCN architectures
```

### Transformer Architectures

#### 1. **Transformer Encoder** (`transformer_encoder`)
Single-branch model that processes velocity sequences:

```
Input: [batch, 2, window_size]  # 2D velocity
  ↓
Input Embedding (with positional encoding)
  ↓
Transformer Encoder (2 layers, 8 heads, 672 dim)
  ↓
Output Embedding (projects to grid_size)
  ↓
Output: [batch, grid_size, sequence_length]  # Probability distribution
```

**Key Components**:
- **Input Embedding**: Converts velocity vectors to transformer dimension
- **Positional Encoding**: Adds temporal information (sine/cosine or learned)
- **Transformer Encoder**: Self-attention layers process the sequence
- **Output Embedding**: Projects to grid size (43,008 classes for building C)

#### 2. **Transformer 2-Branch** (`transformer_2branch`)
Dual-branch architecture with encoder-decoder structure:

```
Branch 1 (Encoder):
  Velocity → Encoder → Additional Encoder Layers → Position Distribution

Branch 2 (Decoder):
  Velocity → Encoder → [Memory: Previous Positions] → Decoder → Position Distribution
```

**Architecture Details**:
- **Shared Encoder**: Both branches use the same encoder to process velocity
- **Encoder-Only Branch**: Additional transformer layers → direct position prediction
- **Decoder Branch**: Uses encoder output + position memory → refined prediction
- **Memory**: Previous position predictions (one-hot encoded over grid)

**Why Two Branches?**
- **Encoder branch**: Fast, direct prediction from velocity
- **Decoder branch**: Slower but more accurate, uses temporal consistency

### Sequence-to-Sequence Architectures

#### LSTM Network (`lstm_net`)
- Bidirectional LSTM processes velocity sequences
- Simpler than transformers but less expressive
- Used as baseline/comparison

#### TCN Network (`tcn_net`)
- Temporal Convolutional Network
- Uses dilated convolutions for temporal modeling
- More efficient than transformers for some tasks

### Input/Output Embeddings

The system uses flexible embedding layers:

**Input Embeddings** (`io_factory.py`):
- `fc_input`: Fully connected layer
- `cnn1d_*`: 1D convolutional layers
- `tcn`: Temporal convolutional layers
- All include positional encoding options

**Output Embeddings**:
- `fc`: Fully connected → grid_size
- `cnnfc_*`: CNN + FC layers
- Projects transformer/LSTM output to grid probability distribution

---

## Training Framework

### PyTorch Lightning Integration

The codebase uses PyTorch Lightning for:
- Automatic mixed precision
- Multi-GPU training
- Checkpoint management
- Logging to TensorBoard
- Learning rate scheduling

### Training Modules

#### 1. **Standard1branchModule** (`standard_1branch.py`)
Simple training loop:
```python
forward(features) → predictions
loss = CrossEntropyLoss(predictions, ground_truth_grid_indices)
```

#### 2. **Scheduled2branchModule** (`scheduled_2branch.py`)
More sophisticated training with scheduled sampling:

**Scheduled Sampling**:
- During training, decoder receives a mix of:
  - Ground truth positions (teacher forcing)
  - Previous predictions (autoregressive)
- Ratio controlled by `tr_ratio` (teacher ratio)
- Starts high (mostly ground truth), decreases over time

**Training Loss**:
```python
loss = encoder_loss * weight + decoder_loss * (1 - weight)
```

**Why Scheduled Sampling?**
- Prevents exposure bias (model never sees its own errors during training)
- Gradually transitions from teacher forcing to autoregressive prediction
- Improves generalization to inference conditions

### Training Configuration

Key parameters in `trainer.py`:

1. **Window Configuration**:
   - `window_time`: Duration of each window (e.g., 1.0 seconds)
   - `sample_freq`: Output frequency (e.g., 10Hz → predict every 0.1s)
   - `imu_freq`: Input frequency (200Hz)

2. **Model Configuration**:
   - `d_model`: Transformer dimension (672)
   - `nhead`: Attention heads (8)
   - `encoder_layers`: Number of encoder layers (2)
   - `decoder_layers`: Number of decoder layers (2)
   - `sample`: Downsampling factor (predict every Nth frame)

3. **Optimization**:
   - Optimizer: AdamW
   - Learning rate: 3e-4
   - Scheduler: WarmupReduceLROnPlateau
   - Epochs: 800

### Checkpoint Management

The system implements sophisticated checkpoint handling:
- **Automatic versioning**: Creates `version_0`, `version_1`, etc.
- **Resume from last**: Can automatically resume from last checkpoint
- **Best model saving**: Saves top-10 models by validation loss
- **Periodic saves**: Saves every N epochs

---

## Evaluation System

### Evaluation Pipeline (`evaluate.py`)

The evaluation system is comprehensive and includes:

#### 1. **Inference Modes**

**Standard Inference**:
- Processes entire trajectory with sliding windows
- Handles overlap between windows
- Can use ground truth positions for decoder (for analysis)

**Minimal Inference**:
- Optimized for speed benchmarking
- Processes trajectory sequentially
- Minimal memory allocation

#### 2. **Trajectory Reconstruction**

The system reconstructs full trajectories from window predictions:

```python
# For each window:
1. Get softmax probabilities over grid
2. Apply smoothing (optional Gaussian filter)
3. Convert to coordinates: argmax → grid cell → (x, y)
4. Handle window overlap (weighted average)
```

**Smoothing Options**:
- **No smoothing**: Use argmax of each window independently
- **Gaussian smoothing**: Apply filter to probability heatmaps
- **Temporal smoothing**: Weight predictions by position in window

#### 3. **Error Metrics**

**Distance Error**:
- Euclidean distance between predicted and ground truth positions
- Computed at each time step
- Reported as:
  - Mean error
  - CDF (Cumulative Distribution Function): % of frames below threshold
  - AUC (Area Under Curve) for error thresholds

**Angle Error**:
- Direction error between predicted and ground truth velocity vectors
- Measures trajectory orientation accuracy

**Performance Metrics**:
- Execution time per trajectory
- Execution time per frame
- Execution time per minute of trajectory

#### 4. **Visualization**

The system generates rich visualizations:

**Trajectory Plots**:
- Overlay predicted vs. ground truth on floorplan
- Color-code by error magnitude
- Show error over time

**Heatmap Videos**:
- Probability distribution over floorplan at each time step
- Shows model's uncertainty
- Useful for debugging

**Error Curves**:
- CDF plots showing error distribution
- Compare encoder vs. decoder performance

### Output Files

Evaluation generates:
- `summary.json`: Aggregate metrics
- `errors.txt`: Per-trajectory errors
- `exec_time.txt`: Performance metrics
- `*_traj.txt`: Full trajectories (timestamp, pred_x, pred_y, gt_x, gt_y)
- TensorBoard logs: Visualizations and videos

---

## Configuration Management

### Hydra Configuration System

The project uses **Hydra** for hierarchical configuration management. This allows:

1. **Modular Configs**: Separate configs for dataset, architecture, training, etc.
2. **Easy Experimentation**: Override any parameter from command line
3. **Reproducibility**: Save full config with each run

### Configuration Structure

```
config/
├── defaults.yaml          # Main config (composes others)
├── dataset/
│   ├── A.yaml            # Building A dataset paths
│   ├── B.yaml            # Building B dataset paths
│   └── C.yaml            # Building C dataset paths
├── grid/
│   ├── A.yaml            # Building A floorplan grid
│   ├── B.yaml            # Building B floorplan grid
│   └── C.yaml            # Building C floorplan grid
├── arch/
│   ├── transformer_2branch.yaml
│   ├── transformer_encoder.yaml
│   └── input/            # Input embedding configs
│   └── output/           # Output embedding configs
├── task/
│   ├── standard_1branch.yaml
│   ├── scheduled_1branch.yaml
│   └── scheduled_2branch.yaml
└── train_cfg/
    ├── optimizer/        # Optimizer configs
    └── scheduler/        # LR scheduler configs
```

### Key Configuration Parameters

**Grid Configuration** (`grid/C.yaml`):
```yaml
size: [112, 384]          # Grid dimensions (width, height)
bounds: [0, 112, 0, 384]   # Coordinate bounds
cell_length: 1.0          # Meters per cell
elements: 43008           # Total grid cells (112 * 384)
dpi: 10.0                 # Pixels per meter
```

**Data Configuration** (`data/train.yaml`):
```yaml
imu_freq: 200             # IMU sampling frequency
window_time: 1.0          # Window duration (seconds)
sample_freq: 10           # Output frequency (Hz)
batch_size: 32
```

**Architecture Configuration** (`arch/transformer_2branch.yaml`):
```yaml
d_model: 672              # Transformer dimension
nhead: 8                 # Attention heads
encoder_layers: 2
decoder_layers: 2
dropout: 0.2
sample: 10               # Predict every 10th frame
```

---

## Key Technical Concepts

### 1. Grid-Based Classification

**Why Classification Instead of Regression?**

- **Stability**: Classification is more stable than regression for this problem
- **Uncertainty**: Softmax probabilities provide natural uncertainty estimates
- **Multi-modal**: Can represent multiple possible locations
- **Regularization**: Grid discretization acts as implicit regularization

**Trade-offs**:
- Grid resolution limits accuracy (can't predict sub-cell precision)
- Large output space (43K classes) requires careful architecture design
- Memory: Softmax over 43K classes is memory-intensive

### 2. Velocity as Input

**Why Velocity Instead of Raw IMU?**

- **Abstraction**: Velocity is a higher-level feature than raw accelerometer/gyro
- **Invariance**: Less sensitive to device orientation changes
- **Integration**: Position is integral of velocity (natural relationship)
- **Pre-processing**: Can use existing VIO systems (RoNIN) to compute velocity

**During Training**: Uses ground truth velocity from Visual SLAM
**During Inference**: Uses velocity from a pre-processing model (e.g., RoNIN)

### 3. Scheduled Sampling

**The Problem**: During training, decoder always sees ground truth. During inference, it only sees its own predictions. This mismatch causes poor performance.

**The Solution**: Gradually transition from teacher forcing to autoregressive:
- Early epochs: 100% ground truth
- Later epochs: Mix of ground truth and predictions
- Final epochs: Mostly predictions

**Implementation**:
```python
tr_ratio = 1.0 → 0.0  # Teacher ratio decreases over time
if random() < tr_ratio:
    use_ground_truth()
else:
    use_model_prediction()
```

### 4. Dual-Branch Architecture

**Encoder Branch**:
- Fast inference (single forward pass)
- No temporal dependencies
- Good for real-time applications

**Decoder Branch**:
- Slower (autoregressive)
- Uses position history
- More accurate (temporal consistency)

**Training**: Both branches trained jointly
**Inference**: Can use either or both (decoder typically better)

### 5. Window-Based Processing

**Why Windows?**
- Transformers/LSTMs process fixed-length sequences
- Long trajectories broken into overlapping windows
- Overlap ensures temporal continuity

**Overlap Handling**:
- During inference, predictions from overlapping windows are averaged
- Weights favor predictions from center of window
- Prevents discontinuities at window boundaries

### 6. Position Memory Encoding

**One-Hot Encoding**:
- Previous positions encoded as one-hot vectors over grid
- Shape: `[batch, grid_size, sequence_length]`
- Each timestep: one-hot vector indicating position

**Memory Updates**:
- During training: Mix of ground truth and predictions
- During inference: Only predictions (autoregressive)
- Initial position: Uniform distribution or ground truth (if available)

### 7. Coordinate System Transformations

**Multiple Coordinate Systems**:
1. **Global Coordinates**: Real-world (x, y) in meters
2. **Grid Coordinates**: Discrete indices (0 to grid_size-1)
3. **Normalized Coordinates**: (0, 1) range for visualization

**Conversions**:
```python
# Global → Grid
grid_x = round((global_x - bounds[0]) / cell_size)
grid_y = round((global_y - bounds[2]) / cell_size)
grid_idx = grid_x * grid_height + grid_y

# Grid → Global
global_x = grid_x * cell_size + bounds[0]
global_y = grid_y * cell_size + bounds[2]
```

### 8. Loss Function

**Cross-Entropy Loss**:
- Standard classification loss
- Compares predicted probability distribution to ground truth one-hot
- Handles class imbalance (some grid cells never visited)

**Multi-Branch Loss**:
```python
total_loss = encoder_loss * α + decoder_loss * (1 - α)
```
- Weighted combination of both branches
- Typically α = 0.5 (equal weighting)

---

## Workflow Summary

### Training Workflow

1. **Data Loading**:
   - Load HDF5 files
   - Extract velocity from positions
   - Convert positions to grid indices
   - Create sliding windows

2. **Forward Pass**:
   - Input: `[batch, 2, window_size]` velocity
   - Encoder: Process velocity → hidden states
   - Decoder: Process hidden states + memory → predictions
   - Output: `[batch, grid_size, sequence_length]` probabilities

3. **Loss Computation**:
   - Target: `[batch, sequence_length]` grid indices
   - Loss: Cross-entropy over grid classes
   - Backpropagation

4. **Checkpointing**:
   - Save model state
   - Save optimizer state
   - Save `tr_ratio` (for scheduled sampling)

### Inference Workflow

1. **Load Model**: From checkpoint
2. **Process Trajectory**:
   - Sliding windows with overlap
   - For each window: predict probability distribution
   - Convert to coordinates: argmax → grid cell → (x, y)
3. **Reconstruct Trajectory**:
   - Handle window overlap (weighted average)
   - Apply smoothing (optional)
   - Generate full trajectory
4. **Evaluate**:
   - Compute distance/angle errors
   - Generate visualizations
   - Save results

---

## File Organization

### Core Modules

- `trainer.py`: Main training entry point
- `evaluate.py`: Evaluation and inference
- `models/`: Model architecture factories
- `network/`: PyTorch Lightning modules (training logic)
- `data/`: Dataset loading and processing
- `config/`: Hydra configuration files

### Key Design Patterns

1. **Factory Pattern**: Model creation (`model_factory.py`)
2. **Strategy Pattern**: Different training modules (standard, scheduled)
3. **Template Method**: Base classes define structure, subclasses implement details
4. **Configuration as Code**: Hydra for flexible experimentation

---

## Advanced Topics

### 1. Multi-Level Grids
The codebase supports multi-resolution grids (see `CSVGlobalMultiLevelSequence`), allowing predictions at different scales for hierarchical localization.

### 2. Synthetic Data Generation
The `preprocess/` directory contains code for generating synthetic IMU data, useful for pre-training or data augmentation.

### 3. Model Ensembling
Multiple checkpoints can be evaluated and results aggregated (see `checkpoints_*.txt` files).

### 4. Transfer Learning
Models can be pre-trained on synthetic data, then fine-tuned on real data (see `train_synthetic.sh`).

---

## Conclusion

NILOC represents a sophisticated approach to indoor localization that:
- Treats localization as classification over a grid
- Uses velocity as an intermediate representation
- Leverages transformer architectures for sequence modeling
- Implements scheduled sampling for robust training
- Provides comprehensive evaluation and visualization

The codebase is well-structured, modular, and designed for experimentation, making it an excellent reference for sequence-to-sequence learning, transformer architectures, and sensor fusion applications.

