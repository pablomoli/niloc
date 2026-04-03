#!/bin/bash

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Inference script for Avalon 2nd floor NILOC model"
    echo "Usage: $0"
    echo ""
    echo "Runs evaluate.py on all sessions listed in outputs/niloc_input_1hz/test.txt"
    echo "using the epoch=99 checkpoint from models/avalon_2nd_floor_syn/."
    exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

uv run python niloc/cmd_test_file.py \
    run_name=avalon_2nd_floor_syn \
    dataset=avalon_2nd_floor \
    grid=avalon_2nd_floor \
    data=avalon_syn \
    +arch/input@arch.encoder_input=tcn \
    +arch/output@arch.encoder_output=cnnfc_avalon_2nd_floor \
    +arch/input@arch.decoder_input=cnn1d_avalon_2nd_floor \
    +arch/output@arch.decoder_output=cnnfc_avalon_2nd_floor \
    arch.d_model=128 \
    task=scheduled_2branch \
    test_cfg.test_name=out \
    test_cfg.minimal=true \
    ckpt_file=models/avalon_2nd_floor_syn/test_ckpts.txt \
    "dataset.root_dir=${REPO_ROOT}/outputs/niloc_input_1hz" \
    "dataset.test_list=${REPO_ROOT}/outputs/niloc_input_1hz/test.txt"
