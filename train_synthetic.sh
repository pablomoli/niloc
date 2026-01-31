#!/bin/bash

if [[ ( $@ == "--help") ||  $@ == "-h" ]]
then
	echo "Pre-training script for NILoc"
	echo "Usage: $0 [building]"
	echo "Buildings should be configured in niloc/config. Default options=[A, B, C]"
	exit 0
fi

echo $1 'Building'

# Determine model dimension based on building (compatible with bash 3.2+)
case $1 in
  A)
    model_dim=432
    ;;
  B)
    model_dim=704
    ;;
  C)
    model_dim=672
    ;;
  *)
    echo "Unknown building: $1. Expected A, B, or C"
    exit 1
    ;;
esac

python niloc/trainer.py run_name=$1_syn dataset=$1_syn grid=$1 +arch/input@arch.encoder_input=tcn +arch/output@arch.encoder_output=cnnfc_$1 +arch/input@arch.decoder_input=cnn1d_$1 +arch/output@arch.decoder_output=cnnfc_$1 train_cfg.accelerator=auto +train_cfg.devices=auto data.batch_size=32 arch.d_model=${model_dim} train_cfg.scheduler.monitor=val_enc_loss