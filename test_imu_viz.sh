#!/bin/bash

if [[ ( $@ == "--help") ||  $@ == "-h" ]]
then
	echo "Testing script for NILoc with visualizations enabled"
	echo "Usage: \"$0 [building] [checkpoint files]\""
	echo "Buildings should be configured in niloc/config. Default options=[A, B, C]"
	echo "Example: $0 A checkpoints_A.txt"
	exit 0
fi

if [ $# -lt 2 ]; then
	echo "Error: Both building and checkpoint file are required"
	echo "Usage: $0 [building] [checkpoint_file]"
	echo "Example: $0 A checkpoints_A.txt"
	exit 1
fi

echo $1 'Building'
echo "Checkpoint file: $2"

python niloc/cmd_test_file.py run_name=$1 dataset=$1 grid=$1 data=test task=scheduled_2branch test_cfg.test_name=out_viz test_cfg.minimal=false test_cfg.full_traj_heatmap=true test_cfg.individual_traj_heatmap=false test_cfg.save_n_plots=5 ckpt_file=${2}

