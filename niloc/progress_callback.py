"""Per-epoch progress logging with decoder loss and ETA (issue #30)."""

import time
from collections import deque
from typing import Optional

import pytorch_lightning as pl


class EpochProgress(pl.Callback):
    """Compact per-epoch status line exposing decoder loss and ETA.

    The default Lightning progress bar prints only the combined ``train_loss``.
    For the 2-branch architecture that metric is dominated by the encoder loss,
    which plateaus by ~epoch 40 by design — masking decoder progress, which is
    the signal that actually matters past the scheduled-sampling warmup.
    """

    def __init__(self, max_epochs: int, window: int = 10) -> None:
        self.max_epochs = max_epochs
        self._durations: deque = deque(maxlen=window)
        self._epoch_start: Optional[float] = None

    def on_train_epoch_start(self, trainer: pl.Trainer, pl_module: pl.LightningModule) -> None:
        self._epoch_start = time.time()

    def on_train_epoch_end(self, trainer: pl.Trainer, pl_module: pl.LightningModule) -> None:
        if self._epoch_start is None:
            return
        duration = time.time() - self._epoch_start
        self._durations.append(duration)
        avg = sum(self._durations) / len(self._durations)
        remaining = max(0, self.max_epochs - trainer.current_epoch - 1)
        eta_s = int(avg * remaining)
        hours, rem = divmod(eta_s, 3600)
        mins, _ = divmod(rem, 60)

        metrics = trainer.callback_metrics

        def _fmt(key: str) -> str:
            v = metrics.get(key)
            return f"{float(v):.3f}" if v is not None else "   -  "

        enc = _fmt("train_enc_loss_epoch")
        dec = _fmt("train_dec_loss_epoch")
        total = _fmt("train_loss_epoch")
        tr = metrics.get("tr_ratio")
        tr_str = f"{float(tr):.2f}" if tr is not None else "  -  "

        print(
            f"[epoch {trainer.current_epoch:4d}/{self.max_epochs}] "
            f"enc={enc} dec={dec} total={total} tr={tr_str} "
            f"time={duration:5.1f}s  ETA={hours}h{mins:02d}m ({avg:.1f} s/ep avg)",
            flush=True,
        )
