#!/bin/bash
ulimit -n 4096

if [[ ( $@ == "--help") ||  $@ == "-h" ]]
then
	echo "Training script for NILoc"
	echo "Usage: \"$0 [building]\"  : to train from scratch"
	echo "Usage: \"$0 [building] [model_checkpoint_path]\"  : to train from pre-trained checkpoint"
	echo "Buildings should be configured in niloc/config. Default options=[A, B, C]"
	exit 0
fi

echo $1 'Building'
echo $#

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

if [ $# -eq 2 ]; then
  python niloc/trainer.py run_name=$1 dataset=$1 grid=$1 +arch/input@arch.encoder_input=tcn +arch/output@arch.encoder_output=cnnfc_$1 +arch/input@arch.decoder_input=cnn1d_$1 +arch/output@arch.decoder_output=cnnfc_$1 train_cfg.accelerator=auto +train_cfg.devices=auto data.batch_size=32 arch.d_model=${model_dim} train_cfg.scheduler.monitor=val_enc_loss train_cfg.tr_ratio=0.8 train_cfg.tr_warmup=5 +train_cfg.restore_tr_ratio=False "train_cfg.load_weights_only=\"${2}\""
else
  python niloc/trainer.py run_name=$1 dataset=$1 grid=$1 +arch/input@arch.encoder_input=tcn +arch/output@arch.encoder_output=cnnfc_$1 +arch/input@arch.decoder_input=cnn1d_$1 +arch/output@arch.decoder_output=cnnfc_$1 train_cfg.accelerator=auto +train_cfg.devices=auto data.batch_size=32 arch.d_model=${model_dim} train_cfg.scheduler.monitor=val_enc_loss
fi