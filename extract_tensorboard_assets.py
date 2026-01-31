#!/usr/bin/env python3
"""
Extract videos and images from TensorBoard event files
Usage: python extract_tensorboard_assets.py [logdir] [output_dir]
"""
import sys
import os
from pathlib import Path
import numpy as np
from PIL import Image
import imageio

try:
    from tensorboard.backend.event_processing.event_accumulator import EventAccumulator
    import io
except ImportError:
    print("Error: tensorboard package required. Install with: pip install tensorboard")
    sys.exit(1)


def extract_assets(logdir, output_dir):
    """Extract videos and images from TensorBoard event files"""
    logdir = Path(logdir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Reading TensorBoard logs from: {logdir}")
    print(f"Saving extracted assets to: {output_dir}")
    print()
    
    # Find all event files
    event_files = list(logdir.rglob("events.out.tfevents.*"))
    
    if not event_files:
        print(f"No event files found in {logdir}")
        return
    
    print(f"Found {len(event_files)} event file(s)")
    print()
    
    for event_file in event_files:
        print(f"Processing: {event_file.relative_to(logdir)}")
        
        try:
            # Create event accumulator
            ea = EventAccumulator(
                str(event_file.parent),
                size_guidance={
                    EventAccumulator.IMAGES: 0,
                    EventAccumulator.AUDIO: 0,
                    EventAccumulator.SCALARS: 0,
                    EventAccumulator.HISTOGRAMS: 0,
                    EventAccumulator.TENSORS: 0,
                }
            )
            ea.Reload()
            
            # Extract images
            if EventAccumulator.IMAGES in ea.Tags():
                images_tag = ea.Tags()[EventAccumulator.IMAGES]
                print(f"  Found {len(images_tag)} image tag(s)")
                
                for tag in images_tag:
                    image_events = ea.Images(tag)
                    print(f"    Tag: {tag} ({len(image_events)} image(s))")
                    
                    # Create output directory for this tag
                    tag_dir = output_dir / event_file.parent.name / "images" / tag.replace("/", "_")
                    tag_dir.mkdir(parents=True, exist_ok=True)
                    
                    for i, img_event in enumerate(image_events):
                        # Convert image string to numpy array
                        img = Image.open(io.BytesIO(img_event.encoded_image_string))
                        img_path = tag_dir / f"step_{img_event.step}_idx_{i}.png"
                        img.save(img_path)
                        print(f"      Saved: {img_path.name}")
            
            # Extract videos (stored as tensors)
            if EventAccumulator.TENSORS in ea.Tags():
                tensor_tags = ea.Tags()[EventAccumulator.TENSORS]
                video_tags = [t for t in tensor_tags if 'video' in t.lower() or 'full' in t.lower()]
                
                if video_tags:
                    print(f"  Found {len(video_tags)} potential video tag(s)")
                    # Note: Video extraction from event files is more complex
                    # and may require tensorflow or specific tensorboard utilities
                    print("    Note: Video extraction requires additional processing")
                    print("    Videos are embedded in event files and may need tensorflow to extract")
            
        except Exception as e:
            print(f"  Error processing {event_file.name}: {e}")
            continue
        
        print()
    
    print("Extraction complete!")
    print(f"Assets saved to: {output_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_tensorboard_assets.py [logdir] [output_dir]")
        print("Example: python extract_tensorboard_assets.py models/A/logs/version_0 extracted_assets")
        sys.exit(1)
    
    logdir = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "extracted_tensorboard_assets"
    
    extract_assets(logdir, output_dir)

