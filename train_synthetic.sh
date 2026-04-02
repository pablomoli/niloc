#!/bin/bash

if [[ ( $@ == "--help") ||  $@ == "-h" ]]
then
	echo "Pre-training script for NILoc"
	echo "Usage: $0 [building] [data_dir]"
	echo "Buildings should be configured in niloc/config. Default options=[A, B, C, avalon_2nd_floor]"
	echo ""
	echo "For avalon_2nd_floor, data_dir is required — path to the fabricated dataset:"
	echo "  $0 avalon_2nd_floor /path/to/niloc/outputs/fabricated/avalon_2nd_floor"
	exit 0
fi

BUILDING=$1
DATA_DIR=$2

echo $BUILDING 'Building'

declare -A model_dim
model_dim["A"]=432
model_dim+=( ["B"]=704 ["C"]=672 ["avalon_2nd_floor"]=128 )

# Avalon fabricated data is 1 fps — must use avalon_syn data config (imu_freq=1.0).
# Default train.yaml uses imu_freq=10.0 which gives window_size=50, producing zero
# training windows for 30-150 frame Avalon sessions.
declare -A data_config
data_config["avalon_2nd_floor"]="avalon_syn"

DATA_CFG=${data_config[$BUILDING]:-train}

EXTRA_OVERRIDES=""
if [[ -n "$DATA_DIR" ]]; then
	EXTRA_OVERRIDES="dataset.root_dir=$DATA_DIR dataset.train_list=$DATA_DIR/train.txt dataset.val_list=$DATA_DIR/val.txt"
fi

python niloc/trainer.py \
  run_name=${BUILDING}_syn \
  dataset=${BUILDING}_syn \
  grid=${BUILDING} \
  data=${DATA_CFG} \
  +arch/input@arch.encoder_input=tcn \
  +arch/output@arch.encoder_output=cnnfc_${BUILDING} \
  +arch/input@arch.decoder_input=cnn1d_${BUILDING} \
  +arch/output@arch.decoder_output=cnnfc_${BUILDING} \
  data.batch_size=4 \
  arch.d_model=${model_dim[$BUILDING]} \
  train_cfg.scheduler.monitor=val_enc_loss \
  $EXTRA_OVERRIDES
