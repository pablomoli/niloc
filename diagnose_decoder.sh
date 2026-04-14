#!/bin/bash
# Decoder collapse diagnostic — issue #31 follow-up.
#
# Runs niloc/diagnose_decoder.py on a single fabricated session with a
# trained 2-branch checkpoint. Measures encoder latent variance across the
# window sequence, decoder autoregressive predictions per step, gradients of
# the top logit wrt feat/memory, and an ablation where feat is replaced with
# zeros and noise.
#
# Usage:
#     bash diagnose_decoder.sh <ckpt_path> [session_name]
#
# Example:
#     bash diagnose_decoder.sh \
#         outputs/2026-04-13/21-59-51/runs/models/avalon_2nd_floor_syn/version_0/epoch=689-tr_ratio=0.0-enc=10.08-dec=8.02.ckpt \
#         fab_graph_0000

set -eu

CKPT=${1:?"Usage: $0 <ckpt_path> [session_name]"}
SESSION=${2:-fab_graph_0000}

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ABS_CKPT="$(cd "$(dirname "$CKPT")" && pwd)/$(basename "$CKPT")"

uv run python niloc/diagnose_decoder.py \
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
    test_cfg.test_name=diag \
    "+test_cfg.model_path=\"${ABS_CKPT}\"" \
    "+test_cfg.session_name=${SESSION}" \
    "dataset.root_dir=${REPO_ROOT}/outputs/fabricated/avalon_2nd_floor_graph" \
    "dataset.test_list=${REPO_ROOT}/outputs/fabricated/avalon_2nd_floor_graph/sanity_test.txt" \
    "grid.image_file=${REPO_ROOT}/niloc/data/avalon/floorplan.png"
