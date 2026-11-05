"""PhoBERT-CNN classifier matching the notebook's TextClassifier architecture."""

import torch
from torch import nn
from transformers import AutoModel


class TextClassifier(nn.Module):
    """PhoBERT encoder + multi-kernel CNN over the last K hidden layers.

    This class intentionally mirrors the TextClassifier defined in the notebook
    so that its ``model_state_dict`` can be loaded without key conversion.
    """

    def __init__(
        self,
        model_name: str = "vinai/phobert-base",
        head: str = "cnn",
        num_labels: int = 3,
        kernel_sizes=(2, 3, 4),
        num_filters: int = 128,
        dropout: float = 0.3,
        last_k: int = 4,
    ) -> None:
        super().__init__()
        if head != "cnn":
            raise ValueError(
                f"This deployment module supports PhoBERT-CNN only; received head={head!r}."
            )
        self.head = head
        self.last_k = int(last_k)
        self.encoder = AutoModel.from_pretrained(
            model_name, output_hidden_states=True
        )
        hidden_size = self.encoder.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.convs = nn.ModuleList(
            [
                nn.Conv1d(
                    hidden_size * self.last_k,
                    num_filters,
                    kernel_size,
                    padding=kernel_size // 2,
                )
                for kernel_size in kernel_sizes
            ]
        )
        self.fc = nn.Linear(num_filters * len(kernel_sizes), num_labels)

    def forward(
        self, input_ids: torch.Tensor, attention_mask: torch.Tensor
    ) -> torch.Tensor:
        output = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
        )
        x = torch.cat(output.hidden_states[-self.last_k :], dim=-1)
        x = (x * attention_mask.unsqueeze(-1).to(x.dtype)).transpose(1, 2)

        pooled = []
        for conv in self.convs:
            conv_output = torch.relu(conv(x))[:, :, : x.size(2)]
            conv_output = conv_output.masked_fill(
                attention_mask.unsqueeze(1) == 0, -1e4
            )
            pooled.append(conv_output.max(dim=2).values)

        return self.fc(self.drop(torch.cat(pooled, dim=1)))
