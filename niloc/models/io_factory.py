import math
from typing import Optional, List, Tuple, Dict, Any, Union

import torch
import torch.nn as nn
from omegaconf import DictConfig, ListConfig
from torch import Tensor

from niloc.models.model_tcn import TemporalConvNet


class PositionalEncoding(nn.Module):
    """
    Original positional encoding from `Attention Is All You Need`
    A series of sin/cos waves of different frequencies added to input
    Args:
        - d_model - input feature dimension
        - dropout - dropout probability
        - max_len - maximum length of sequence (for creating the buffer)
    """

    def __init__(
            self,
            d_model: int,
            dropout: float = 0.1,
            max_len: int = 1000,
    ) -> None:
        super(PositionalEncoding, self).__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)  # [max_len, d_model]
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)  # [max_len, 1]
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))  # [d_model//2]
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)[:, :-1] if d_model % 2 else torch.cos(position * div_term)
        pe = pe.unsqueeze(0).transpose(0, 1)  # [max_len, 1, d_model]
        self.register_buffer("pe", pe)

    def forward(self, x: Tensor) -> Tensor:
        """
        Input size: [sequence_length, batch, features]
        Output size: [sequence_length, batch, features]
        """
        x = x + self.pe[:x.size(0)]
        return self.dropout(x)


class PositionalEncodingCat(nn.Module):
    """
    Original positional encoding from `Attention Is All You Need`
    A series of sin/cos waves of different frequencies concatenated to input
    Args:
        - d_model - input feature dimension
        - dropout - dropout probability
        - max_len - maximum length of sequence (for creating the buffer)
    """

    def __init__(
            self, d_model: int, dropout: float = 0.1, max_len: int = 1000
    ) -> None:
        super(PositionalEncodingCat, self).__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)  # [max_len, d_model]
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)  # [max_len, 1]
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))  # [d_model//2]
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)[:, :-1] if d_model % 2 else torch.cos(position * div_term)
        pe = pe.unsqueeze(0).transpose(0, 1)  # [max_len, 1, d_model]
        self.register_buffer("pe", pe)

    def forward(self, x: Tensor) -> Tensor:
        """
        Input size: [sequence_length, batch, features]
        Output size: [sequence_length, batch, features]
        """
        y = torch.cat([x, self.pe[:x.size(0)].repeat(1, x.size(1), 1)], dim=-1)
        return y


class PositionalEncodingNone(nn.Module):
    """
    Empty encoding
    """

    def __init__(self, *args) -> None:
        super(PositionalEncodingNone, self).__init__()

    def forward(self, x: Tensor) -> Tensor:
        """
        Input size: [sequence_length, batch, features]
        Output size: [sequence_length, batch, features]
        """
        return x


positional_encoders = {
    "original_add": PositionalEncoding,
    "original_cat": PositionalEncodingCat,
    "none": PositionalEncodingNone,
}


def int_or_tuple(x: Union[int, List[int]]) -> Union[int, Tuple[int]]:
    if isinstance(x, int):
        return x
    return tuple(x)


class InputPE(nn.Module):
    """
    Positional encoding only
    """

    def __init__(
            self,
            pe: nn.Module,
            **kwargs: Any,
    ) -> None:
        super(InputPE, self).__init__()
        self.pos_encoder = pe

    def forward(self, x: torch.Tensor):
        """
        :param x: transformer input shape
        :return: y: shape (sequence_length, batch_size, d_model) where d_model = d_output (+ d_pos_encoding)
        """
        return self.pos_encoder(x)


class InputFC(nn.Module):
    """
    Fully connected input layers
    """
    def __init__(
            self,
            d_input: int,
            d_output: int,
            pe: nn.Module,
            permute_idx: Tuple[int],
            dropout: float = 0.5,
            layers: Optional[List[int]] = None,
            sample: int = 1,
    ) -> None:
        super(InputFC, self).__init__()
        if layers is None:
            layers = []
        modules = []
        in_channels = d_input
        for i in layers:
            modules.append(nn.Linear(in_channels, i))
            modules.append(nn.ReLU())
            modules.append(nn.Dropout(dropout))
            in_channels = i
        modules.append(nn.Linear(in_channels, d_output))

        self.fc = nn.Sequential(*modules)
        self.pos_encoder = pe
        self.sample = sample
        self.d_output = d_output
        self.permute_idx = permute_idx

    def forward(self, x: torch.Tensor):
        """
        :param x: any shape that matches output shape when permuted using permute idx
            e.q. (batch_size, d_input,seq_length) --> permute_idx = (2, 0, 1)
                 (batch_size, seq_length, d_input) --> permute_idx = (1, 0, 2)
        :return: y: shape (sequence_length, batch_size, d_model) where d_model = d_output (+ d_pos_encoding)
        """
        y = x.permute(*self.permute_idx)
        y = self.fc(y) * math.sqrt(self.d_output)
        y = self.pos_encoder(y)
        if self.sample > 1:
            # every nth element from n-1
            y = y[self.sample - 1::self.sample]
        return y


class InputTCN(nn.Module):
    """
    TCN input layers.
    """
    def __init__(
            self,
            d_input: int,
            d_output: int,
            num_channels: List[int],
            kernel_size: int,
            pe: nn.Module,
            sample: int = 1,
            dropout: float = 0.5,
            activation: nn.Module = nn.ReLU,
    ) -> None:
        super(InputTCN, self).__init__()

        num_channels[-1] = d_output
        self.tcn = TemporalConvNet(d_input, num_channels, kernel_size, dropout, activation)
        self.pos_encoder = pe
        self.sample = sample
        self.d_output = d_output

    def forward(self, x: torch.Tensor):
        """
        :param x: shape (batch_size, d_input, seq_length)  - for consistency with ConvNet models
        :return: y: shape (sequence_length, batch_size, d_model) where d_model = d_output (+ d_pos_encoding)
        """
        x = self.tcn(x)
        y = x.permute(2, 0, 1)
        y = self.pos_encoder(y * math.sqrt(self.d_output))
        if self.sample > 1:
            # every nth element from n-1
            y = y[self.sample - 1::self.sample]
        return y


class InputCNNImgEncoder(nn.Module):
    def __init__(
            self,
            d_input: int,
            d_output: int,
            channels: List[int],
            kernel_size: List[int],
            pool_kernel: Union[int, List[int]],
            pool_stride: Union[int, List[int]],
            padding: List[int],
            pe: nn.Module,
            sample: int = 1,
            dropout: float = 0.5,
    ) -> None:
        super(InputCNNImgEncoder, self).__init__()

        modules = []
        if not type(pool_stride) in [list, ListConfig]:
            pool_stride = [pool_stride] * len(kernel_size)
        if not type(pool_kernel) in [list, ListConfig]:
            pool_kernel = [pool_kernel] * len(kernel_size)
        for i in range(len(channels) - 2):
            modules.append(nn.Conv2d(channels[i], channels[i + 1], kernel_size=kernel_size[i],
                                     padding=int_or_tuple(padding[i])))
            modules.append(nn.ReLU())
            modules.append(nn.MaxPool2d(pool_kernel[i], pool_stride[i]))
            modules.append(nn.Dropout(dropout))
        modules.append(nn.Conv2d(channels[-2], channels[-1], kernel_size=kernel_size[-1],
                                 padding=int_or_tuple(padding[-1])))
        modules.append(nn.ReLU())
        modules.append(nn.MaxPool2d(pool_kernel[-1], pool_stride[-1]))

        self.cnn_encoder = nn.Sequential(*modules)

        self.pos_encoder = pe
        self.sample = sample
        self.d_output = d_output

    def forward(self, x: torch.Tensor):
        """
        :param x: shape (batch_size, seq_length, height, width)
        :return: y: shape (sequence_length, batch_size, d_model) where d_model = d_output (+ d_pos_encoding)
        """
        # change to batch x sequence, 1, grid_dim[0], grid_dim[1]
        img_in = x.reshape(x.size(0) * x.size(1), -1, x.size(2), x.size(3))
        img_in = self.cnn_encoder(img_in)

        # change to batch, sequence, feat and then to sequence, batch, feat
        y = img_in.reshape(x.size(0), x.size(1), -1).permute(1, 0, 2)
        y = self.pos_encoder(y * math.sqrt(self.d_output))
        if self.sample > 1:
            # every nth element from n-1
            y = y[self.sample - 1::self.sample]
        return y


class InputCNNEncoder(InputCNNImgEncoder):
    def __init__(
            self,
            d_input: int,
            d_output: int,
            channels: List[int],
            kernel_size: List[int],
            pool_kernel: int,
            pool_stride: int,
            padding: List[int],
            pe: nn.Module,
            grid_dim: List[int],
            sample: int = 1,
            dropout: float = 0.5,
    ) -> None:
        super(InputCNNEncoder, self).__init__(d_input, d_output, channels, kernel_size, pool_kernel, pool_stride,
                                              padding, pe, sample, dropout)
        assert d_input == channels[0] * grid_dim[0] * grid_dim[1], \
            f"CNN encoder input dimension mismatch {d_input}: {channels[0]} * {grid_dim}"
        self.grid_dim = grid_dim

        # The CNN output spatial size depends on grid_dim and may not equal d_output (d_model).
        # Compute the actual flat CNN output size and add a projection if needed, so any
        # grid dimensions work regardless of how d_model was chosen.
        with torch.no_grad():
            dummy = torch.zeros(1, channels[0], grid_dim[0], grid_dim[1])
            cnn_flat = self.cnn_encoder(dummy).numel()
        self.proj = nn.Linear(cnn_flat, d_output) if cnn_flat != d_output else nn.Identity()

    def forward(self, x: torch.Tensor):
        """
        :param x: shape (batch_size, d_input, seq_length)
        :return: y: shape (sequence_length, batch_size, d_model) where d_model = d_output (+ d_pos_encoding)
        """
        bs, _, seq_len = x.size()
        # reshape to (batch*seq, channels[0], H, W) for CNN
        # channels[0] is inferred by -1 since d_input == channels[0]*H*W (asserted in __init__)
        img_in = x.permute(0, 2, 1).reshape(bs * seq_len, -1, self.grid_dim[0], self.grid_dim[1])
        img_out = self.cnn_encoder(img_in)
        # project to d_output then apply positional encoding
        y = self.proj(img_out.reshape(bs, seq_len, -1)).permute(1, 0, 2)
        y = self.pos_encoder(y * math.sqrt(self.d_output))
        if self.sample > 1:
            y = y[self.sample - 1::self.sample]
        return y


input_embeddings = {
    "pe_only": InputPE,
    "fc": InputFC,
    "tcn": InputTCN,
    "cnn1d": InputCNNEncoder,
    "cnn2d": InputCNNImgEncoder,
}

output_activation = nn.ReLU
output_activation_type = {
    "relu": nn.ReLU,
    "prelu": nn.PReLU,
    "elu": nn.ELU,
}


def set_activation(activation:str = "relu"):
    global output_activation
    output_activation = output_activation_type[activation]


class OutputFC(nn.Module):
    def __init__(
            self,
            d_input: int,
            d_output: int,
            dropout: float = 0.5,
            layers=None,
    ) -> None:
        super(OutputFC, self).__init__()
        if layers is None:
            layers = []
        modules = []
        in_channels = d_input
        for i in layers:
            modules.append(nn.Linear(in_channels, i))
            modules.append(output_activation())
            modules.append(nn.Dropout(dropout))
            in_channels = i
        modules.append(nn.Linear(in_channels, d_output))
        self.fc = nn.Sequential(*modules)

    def forward(self, x: torch.Tensor):
        """
        :param x: shape (sequence_length, batch_size, d_input)
        :return: y: shape (batch_size, seq_length, d_output)
        """
        return self.fc(x).permute(1, 0, 2)


class OutputCNNDecoder(nn.Module):
    def __init__(
            self,
            d_input: int,
            d_output: int,
            channels: List[int],
            kernel_size: List[int],
            stride: List[int],
            padding: List[int],
            out_padding: List[int],
            interim_dim: List[int],
            dropout: float = 0.5,
            flatten_output: bool = False,
    ) -> None:
        super(OutputCNNDecoder, self).__init__()
        assert d_input == channels[0] * interim_dim[0] * interim_dim[1], \
            f"CNN decoder input dimension mismatch {d_input}: {channels[0]}*{interim_dim}"

        modules = []
        for i in range(len(channels) - 2):
            modules.append(nn.ConvTranspose2d(channels[i], channels[i + 1], kernel_size=kernel_size[i],
                                              stride=stride[i], padding=int_or_tuple(padding[i]),
                                              output_padding=int_or_tuple(out_padding[i])))
            modules.append(output_activation())
            modules.append(nn.Dropout(dropout))
        modules.append(nn.ConvTranspose2d(channels[-2], channels[-1], kernel_size=kernel_size[-1],
                                          stride=stride[-1], padding=int_or_tuple(padding[-1]),
                                          output_padding=int_or_tuple(out_padding[-1])))
        self.cnn_decoder = nn.Sequential(*modules)
        self.flatten_output = flatten_output
        self.interim_dim = interim_dim


    def forward(self, x: torch.Tensor):
        """
        :param x: shape (sequence_length, batch_size, d_model)
        :return: y: shape (batch_size, sequence_length, d_output)
        """
        seq_len, bs, _ = x.size()

        # reshape to batch*seq, channels, H, W
        img_in = x.permute(1, 0, 2).reshape(bs * seq_len, -1, self.interim_dim[0], self.interim_dim[1])

        # forward through CNN
        img_out = self.cnn_decoder(img_in)

        # upsample to target HxW
        img_out = torch.nn.functional.interpolate(
            img_out, size=(self.target_H, self.target_W), mode="bilinear", align_corners=False
        )

        # flatten and pass through linear layer
        img_flat = img_out.reshape(bs * seq_len, -1)
        y = self.fc(img_flat)

        # reshape back to batch x seq x d_output
        y = y.reshape(bs, seq_len, self.d_output)

        return y

class OutputCNNFCDecoder(OutputCNNDecoder):
    def __init__(
            self,
            d_input: int,
            d_output: int,
            channels: List[int],
            kernel_size: List[int],
            stride: List[int],
            padding: List[int],
            out_padding: List[int],
            interim_dim: List[int],
            dropout: float = 0.5,
    ) -> None:
        super(OutputCNNFCDecoder, self).__init__(d_input, d_output, channels, kernel_size, stride, padding,
                                                 out_padding, interim_dim, dropout, flatten_output=True)
        self.activation = output_activation()
        self.d_output = d_output

        # Determine the flattened CNN output size by running a dummy forward.
        # This decouples the architecture from any requirement that CNN spatial
        # output size matches grid elements, which was true for A/B/C by design
        # but does not hold for arbitrary floorplan grids like Avalon.
        with torch.no_grad():
            dummy = torch.zeros(1, channels[0], interim_dim[0], interim_dim[1])
            cnn_flat = self.cnn_decoder(dummy).numel()
        self.flat_fc = nn.Linear(cnn_flat, d_output)

    def forward(self, x: torch.Tensor):
        """
        :param x: shape (sequence_length, batch_size, d_model)
        :return: y: shape (batch_size, sequence_length, d_output)
        """
        seq_len, bs, _ = x.size()
        img_in = x.permute(1, 0, 2).reshape(bs * seq_len, -1, self.interim_dim[0], self.interim_dim[1])
        img_out = self.activation(self.cnn_decoder(img_in))
        y = self.flat_fc(img_out.reshape(bs * seq_len, -1))
        return y.reshape(bs, seq_len, self.d_output)


output_embeddings = {
    "fc": OutputFC,
    "cnn": OutputCNNDecoder,
    "cnnfc": OutputCNNFCDecoder,
}
