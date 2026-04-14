"""
Decoder collapse diagnostic (issue #31 follow-up).

Answers a narrow question about the trained model: is the autoregressive
decoder actually using the velocity input, or is it ignoring it and emitting
a fixed cell per session regardless?

Observed symptom (2026-04-13 and 2026-04-14 runs): for every window within a
session, the decoder emits the same (x, y) cell even though the velocity
window content is clearly different across windows. Before investing in
architecture changes or more data, we need to know which input the decoder
is actually sensitive to.

This script runs the trained model on a single fabricated session and
measures, per autoregressive step j:

  1. mid_enc variance across steps
        Is the encoder producing different latents for different windows,
        or has the encoder itself collapsed to a constant output?

  2. |∂ pred_dec[:, argmax, j] / ∂ feat|
        Gradient of the top predicted logit at step j with respect to the
        velocity input. Near-zero means the decoder's output is independent
        of the velocity input — either the decoder is ignoring mid_enc, or
        the encoder is producing identical latents.

  3. |∂ pred_dec[:, argmax, j] / ∂ memory[:, :, j-1]|
        Gradient with respect to the previous autoregressive state. Tells
        us whether the decoder is using its recurrent input.

  4. Velocity ablation
        Replace feat with zeros and with random Gaussian noise; rerun the
        full autoregressive loop; compare the argmax trajectory to the
        original. Any difference proves the decoder is at least partially
        velocity-sensitive.

Output: a short text report to stdout. No files written.

Usage (from repo root):

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
        +test_cfg.model_path=\"$(pwd)/outputs/2026-04-13/21-59-51/runs/models/avalon_2nd_floor_syn/version_0/epoch=689-tr_ratio=0.0-enc=10.08-dec=8.02.ckpt\" \
        +test_cfg.session_name=fab_graph_0000 \
        dataset.root_dir=$(pwd)/outputs/fabricated/avalon_2nd_floor_graph \
        dataset.test_list=$(pwd)/outputs/fabricated/avalon_2nd_floor_graph/sanity_test.txt \
        grid.image_file=$(pwd)/niloc/data/avalon/floorplan.png
"""

import logging
import os
import os.path as osp
import sys

import hydra
import numpy as np
import torch
from omegaconf import DictConfig, open_dict

# PyTorch 2.6 weights_only patch (same as evaluate.py)
_torch_load = torch.load
def _load_compat(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _torch_load(f, *args, **kwargs)
torch.load = _load_compat

sys.path.append(osp.join(osp.dirname(osp.abspath(__file__)), ".."))

from niloc.data.niloc_datamodule import dataset_classes, sequence_classes
from niloc.trainer import arg_conversion, get_model


def load_session(cfg: DictConfig, session_name: str):
    """Load a single fabricated session via GlobalLocDataset."""
    sequence_cls = sequence_classes[cfg.data.classes.sequence]
    dataset_cls = dataset_classes[cfg.data.classes.dataset]
    dataset = dataset_cls(
        sequence_type=sequence_cls,
        cfg=cfg,
        root_dir=cfg.dataset.root_dir,
        data_list=[session_name],
        mode="test",
    )
    return dataset


def _to_t(x):
    """Safe tensor → float."""
    if isinstance(x, torch.Tensor):
        return x.detach().cpu().item() if x.numel() == 1 else x.detach().cpu().numpy()
    return x


def diagnose(cfg: DictConfig) -> None:
    pl_seed = cfg.random_seed
    torch.manual_seed(pl_seed)
    np.random.seed(pl_seed)

    arg_conversion(cfg)
    model_type = get_model(cfg)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt_path = cfg.test_cfg.model_path
    network = model_type.load_from_checkpoint(ckpt_path, map_location=device)
    network.eval()
    network.to(device)

    session_name = cfg.test_cfg.session_name
    logging.info("Loading session '%s' from %s", session_name, cfg.dataset.root_dir)
    dataset = load_session(cfg, session_name)

    zero = network.zero
    sample = network.sample
    grid_el = network.hparams.grid.elements
    w = dataset._window_size
    n_windows = len(dataset)
    print(f"Session {session_name}: {n_windows} windows of size {w}  "
          f"(zero={zero}, sample={sample}, grid_elements={grid_el})")

    # ---- 1. Iterate windows, record encoder latent + decoder argmax ------
    # Each window is processed independently with uniform memory (no
    # autoregressive carry-over). This matches the 'start_zero' inference
    # mode and is the simplest per-window probe. We also run a 'start_gt_1'
    # pass that seeds memory[:, :, :1] from GT — the mode the earlier
    # collapse was observed in.
    mid_enc_per_window = []
    enc_argmax_per_window = []
    dec_argmax_start_zero = []
    dec_argmax_start_gt1 = []
    grad_feat_norms = []
    grad_mem_norms = []

    for i in range(n_windows):
        feat_np, targ_np, _seq_id, _frame_id = dataset[i]
        feat = torch.from_numpy(feat_np[None, :, :]).float().to(device)   # [1, 2, w]
        targ = torch.from_numpy(targ_np[None, :]).long().to(device)       # [1, w]

        # Encoder pass with gradient tracking on feat
        feat_leaf = feat[:, :, zero:].clone().detach().requires_grad_(True)
        pred_enc, mid_enc = network.forward_enc(feat_leaf)
        # mid_enc: [seq, batch, model_dim]
        # pred_enc: [batch, output_dim, seq]

        with torch.no_grad():
            mid_flat = mid_enc.detach().squeeze(1)          # [seq, d]
            mid_enc_per_window.append(mid_flat.mean(dim=0).cpu().numpy())  # [d]
            enc_cells = pred_enc.detach().argmax(dim=1).squeeze(0).cpu().numpy()
            enc_argmax_per_window.append(int(np.bincount(enc_cells).argmax()))

        # Decoder pass — start_zero: uniform memory
        targ_gt = targ[:, sample - 1 + zero::sample]
        length = targ_gt.size(1)
        mem_sz = torch.ones(1, grid_el, length, device=device) / grid_el
        mem_leaf = mem_sz.clone().detach().requires_grad_(True)
        pred_dec_sz = network.forward_dec(mid_enc, mem_leaf)  # [1, grid_el, length]
        last_logits = pred_dec_sz[:, :, -1]                   # [1, grid_el]
        top_cell = int(last_logits.argmax(dim=1).item())
        dec_argmax_start_zero.append(top_cell)

        top_logit = last_logits[0, top_cell]
        g_feat, g_mem = torch.autograd.grad(
            top_logit,
            (feat_leaf, mem_leaf),
            retain_graph=False,
            allow_unused=True,
        )
        g_feat_norm = float(g_feat.norm().item()) if g_feat is not None else float("nan")
        g_mem_norm = float(g_mem.norm().item()) if g_mem is not None else float("nan")
        grad_feat_norms.append(g_feat_norm)
        grad_mem_norms.append(g_mem_norm)

        # Decoder pass — start_gt_1: seed memory[:, :, :1] from GT
        with torch.no_grad():
            _, mid_enc_2 = network.forward_enc(feat[:, :, zero:])
            mem_g = torch.ones(1, grid_el, length, device=device) / grid_el
            mem_g[:, :, :1] = network.shift_and_sample_from_gt(targ.to(device), zero)[:, :, :1]
            pred_dec_g = network.forward_dec(mid_enc_2, mem_g)
            dec_argmax_start_gt1.append(int(pred_dec_g[:, :, -1].argmax(dim=1).item()))

    mid_enc_per_window = np.stack(mid_enc_per_window)  # [n_windows, d]

    # ---- 2. Ablation: replace feat with zeros and noise ------------------
    @torch.no_grad()
    def roll_with(feat_mod_fn):
        cells = []
        for i in range(n_windows):
            feat_np, targ_np, _, _ = dataset[i]
            feat = torch.from_numpy(feat_np[None, :, :]).float().to(device)
            targ = torch.from_numpy(targ_np[None, :]).long().to(device)
            feat_in = feat_mod_fn(feat)
            _, mid_enc_a = network.forward_enc(feat_in[:, :, zero:])
            targ_gt = targ[:, sample - 1 + zero::sample]
            length = targ_gt.size(1)
            mem = torch.ones(1, grid_el, length, device=device) / grid_el
            mem[:, :, :1] = network.shift_and_sample_from_gt(targ.to(device), zero)[:, :, :1]
            pd = network.forward_dec(mid_enc_a, mem)
            cells.append(int(pd[:, :, -1].argmax(dim=1).item()))
        return cells

    zero_cells = roll_with(lambda f: torch.zeros_like(f))
    noise_cells = roll_with(lambda f: torch.randn_like(f) * f.std())
    scaled_cells = roll_with(lambda f: f * 10.0)  # 10x velocity — should change argmax if velocity-sensitive

    # ---- 3. Encoder latent similarity across windows ---------------------
    # Cosine sim matrix of per-window mean encoder latents
    from numpy.linalg import norm
    n = mid_enc_per_window.shape[0]
    sims = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            a, b = mid_enc_per_window[i], mid_enc_per_window[j]
            sims[i, j] = (a @ b) / (norm(a) * norm(b) + 1e-12)
    mean_off_diag = (sims.sum() - np.trace(sims)) / (n * n - n)

    # ---- 4. Report -------------------------------------------------------
    def cell_to_xy(cell):
        # grid_dim = [W, H] = [411, 221], stride = H
        H = network.hparams.grid.size[1]
        return (cell // H, cell % H)

    print()
    print("=" * 72)
    print("DECODER COLLAPSE DIAGNOSTIC REPORT")
    print("=" * 72)
    print(f"Session:        {session_name}")
    print(f"Checkpoint:     {osp.basename(ckpt_path)}")
    print(f"Windows probed: {n_windows}")
    print()
    print("-- Encoder health --")
    print(f"  latent cosine sim (off-diag mean): {mean_off_diag:.4f}")
    print(f"    1.00 = identical across windows (encoder collapsed)")
    print(f"    <<1  = windows produce distinct latents (encoder works)")
    print(f"  unique encoder majority-vote cells: "
          f"{len(set(enc_argmax_per_window))} / {n_windows}  {enc_argmax_per_window}")
    print()
    print("-- Decoder per-window argmax --")
    n_uniq_sz = len(set(dec_argmax_start_zero))
    n_uniq_g1 = len(set(dec_argmax_start_gt1))
    print(f"  start_zero:  {n_uniq_sz}/{n_windows} unique  → "
          f"{[cell_to_xy(c) for c in dec_argmax_start_zero]}")
    print(f"  start_gt_1:  {n_uniq_g1}/{n_windows} unique  → "
          f"{[cell_to_xy(c) for c in dec_argmax_start_gt1]}")
    print()
    print("-- Per-window gradient sensitivity (start_zero top logit) --")
    print(f"  {'win':>4} {'argmax':>8} {'|d/d feat|':>14} {'|d/d mem|':>14}")
    for i, (c, gf, gm) in enumerate(zip(dec_argmax_start_zero, grad_feat_norms, grad_mem_norms)):
        print(f"  {i:>4} {c:>8} {gf:>14.4e} {gm:>14.4e}")
    mean_gf = float(np.nanmean(grad_feat_norms))
    mean_gm = float(np.nanmean(grad_mem_norms))
    print(f"  mean: |d/d feat|={mean_gf:.3e}   |d/d mem|={mean_gm:.3e}   "
          f"ratio={mean_gf / (mean_gm + 1e-12):.3f}")
    print()
    print("-- Ablation on start_zero mode --")
    print(f"  original feat:        {dec_argmax_start_zero}")
    print(f"  feat = zeros:         {zero_cells}  "
          f"{'SAME' if zero_cells == dec_argmax_start_zero else 'DIFFERENT'}")
    print(f"  feat = random noise:  {noise_cells}  "
          f"{'SAME' if noise_cells == dec_argmax_start_zero else 'DIFFERENT'}")
    print(f"  feat x 10:            {scaled_cells}  "
          f"{'SAME' if scaled_cells == dec_argmax_start_zero else 'DIFFERENT'}")
    print()
    print("-- Interpretation --")
    if mean_off_diag > 0.99:
        print("  * ENCODER is producing ~identical latents for every window.")
        print("    The collapse is upstream of the decoder: windows with totally")
        print("    different velocity content produce the same encoder output, so")
        print("    the decoder can't distinguish them by construction.")
        print("    Fix target: encoder architecture or training data diversity.")
    elif mean_off_diag > 0.9:
        print("  * Encoder latents are highly similar across windows but not")
        print("    identical — encoder is partially collapsed.")
    else:
        print(f"  * Encoder produces distinct latents (sim={mean_off_diag:.2f}).")
        if n_uniq_sz <= 1:
            print("    …but the DECODER still emits one cell regardless.")
            print("    Fix target: decoder architecture or autoregressive dynamics.")

    if zero_cells == dec_argmax_start_zero and noise_cells == dec_argmax_start_zero:
        print("  * Ablation: zeros AND noise produce identical predictions →")
        print("    model output is fully independent of velocity input.")
    elif scaled_cells != dec_argmax_start_zero:
        print("  * Ablation: 10x feat scaling changes predictions — decoder is")
        print("    at least marginally velocity-sensitive.")
    print()


@hydra.main(config_path="config", config_name="defaults")
def run(cfg: DictConfig) -> None:
    diagnose(cfg)


if __name__ == "__main__":
    run()
