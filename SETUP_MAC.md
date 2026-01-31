# Setup Guide for M3 MacBook Pro (Apple Silicon)

This guide will help you set up the NILoc project on your M3 MacBook Pro using Python venv instead of conda.

## Prerequisites

1. **Python 3.9 or higher** (Python 3.8+ should work, but 3.9+ is recommended)
2. **Homebrew** (for installing ffmpeg)

## Step-by-Step Setup

### 1. Install ffmpeg (if not already installed)

```bash
brew install ffmpeg
```

### 2. Create and activate virtual environment

```bash
cd /Users/melocoton/Developer/niloc

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate
```

### 3. Upgrade pip

```bash
pip install --upgrade pip
```

### 4. Install PyTorch for Apple Silicon

First, install PyTorch with MPS (Metal Performance Shaders) support:

```bash
pip install torch torchvision torchaudio
```

This will automatically install the Apple Silicon compatible version.

### 5. Install other dependencies

```bash
pip install -r requirements.txt
```

### 6. Verify installation

Test that PyTorch can use MPS:

```python
python3 -c "import torch; print(f'MPS available: {torch.backends.mps.is_available() if hasattr(torch.backends, \"mps\") else False}')"
```

You should see `MPS available: True` if everything is set up correctly.

## Usage

### Training

The training scripts have been updated to automatically detect and use Apple Silicon:

```bash
# Train from scratch
./train_imu.sh A

# Train from pretrained checkpoint
./train_imu.sh A /path/to/checkpoint.ckpt

# Pretrain with synthetic data
./train_synthetic.sh A
```

**Note:** Batch sizes have been reduced from 80 to 32 for Apple Silicon compatibility. You can adjust this in the shell scripts if needed based on your Mac's memory.

### Testing

```bash
./test_imu.sh A checkpoint_file.txt
```

## Key Changes Made

1. **Updated dependencies** to modern versions compatible with Apple Silicon
2. **PyTorch Lightning** updated from 1.2.6 to 2.0+
3. **Automatic accelerator detection** - uses MPS on Apple Silicon, CUDA on NVIDIA GPUs, CPU otherwise
4. **Removed deprecated APIs**:
   - `gpus` and `distributed_backend` → `accelerator` and `devices`
   - `progress_bar_refresh_rate` → `enable_progress_bar`
   - `period` in ModelCheckpoint → `every_n_epochs`
   - `resume_from_checkpoint` → `ckpt_path`
5. **Fixed AttributeDict imports** - replaced with DictConfig
6. **Reduced batch sizes** for Apple Silicon memory constraints

## Troubleshooting

### MPS not available

If MPS is not available, the code will fall back to CPU. Make sure you have:
- macOS 12.3 or later
- PyTorch 2.0 or later
- Apple Silicon Mac (M1, M2, M3, etc.)

### Out of memory errors

If you encounter memory issues:
1. Reduce batch size further in the training scripts (try 16 or 8)
2. Close other applications
3. Consider using gradient accumulation if needed

### Import errors

Make sure your virtual environment is activated:
```bash
source venv/bin/activate
```

## Notes

- The code automatically detects and uses the best available accelerator (MPS > CUDA > CPU)
- Training will be slower on CPU than on GPU, but should still work
- Some operations may not be fully optimized for MPS yet, but most common operations work well

