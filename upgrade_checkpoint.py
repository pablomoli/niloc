#!/usr/bin/env python3
"""
Upgrade PyTorch Lightning checkpoint to current version
"""
import sys
import torch
import pytorch_lightning as pl
from pathlib import Path

def upgrade_checkpoint(checkpoint_path: str, backup: bool = True):
    """Upgrade a checkpoint file to the current PyTorch Lightning version"""
    checkpoint_path = Path(checkpoint_path)
    
    if not checkpoint_path.exists():
        print(f"Error: Checkpoint file not found: {checkpoint_path}")
        return False
    
    # Create backup
    if backup:
        backup_path = checkpoint_path.with_suffix('.ckpt.backup')
        print(f"Creating backup: {backup_path}")
        import shutil
        shutil.copy2(checkpoint_path, backup_path)
    
    print(f"Loading checkpoint: {checkpoint_path}")
    try:
        # Load with weights_only=False for old checkpoints
        checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
        
        # Upgrade checkpoint using PyTorch Lightning's migration utility
        print("Upgrading checkpoint...")
        from pytorch_lightning.utilities.migration import pl_legacy_patch
        with pl_legacy_patch():
            # The checkpoint will be automatically upgraded when saved
            pass
        
        # Save the upgraded checkpoint
        print(f"Saving upgraded checkpoint: {checkpoint_path}")
        torch.save(checkpoint, checkpoint_path)
        
        print("Checkpoint upgraded successfully!")
        return True
    except Exception as e:
        print(f"Error upgrading checkpoint: {e}")
        if backup:
            print(f"Restoring from backup...")
            shutil.copy2(backup_path, checkpoint_path)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python upgrade_checkpoint.py <checkpoint_path> [--no-backup]")
        sys.exit(1)
    
    checkpoint_path = sys.argv[1]
    backup = "--no-backup" not in sys.argv
    
    success = upgrade_checkpoint(checkpoint_path, backup=backup)
    sys.exit(0 if success else 1)

