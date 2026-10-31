"""PhoBERT encoder with the cross-attention head used during training."""
import torch
from torch import Tensor, nn
from transformers import AutoModel


class CrossAttentionBlock(nn.Module):
    def __init__(
        self, hidden: int, heads: int, attn_dropout: float, dropout: float
    ) -> None:
        super().__init__()
        self.attn = nn.MultiheadAttention(
            hidden, heads, dropout=attn_dropout, batch_first=True
        )
        self.norm1 = nn.LayerNorm(hidden)
        self.ffn = nn.Sequential(
            nn.Linear(hidden, hidden * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden * 2, hidden),
        )
        self.norm2 = nn.LayerNorm(hidden)
        self.drop = nn.Dropout(dropout)

    def forward(
        self, query: Tensor, key_value: Tensor, key_padding_mask: Tensor
    ) -> Tensor:
        attended, _ = self.attn(
            query,
            key_value,
            key_value,
            key_padding_mask=key_padding_mask,
            need_weights=False,
        )
        output = self.norm1(query + self.drop(attended))
        return self.norm2(output + self.drop(self.ffn(output)))


def masked_mean(sequence: Tensor, attention_mask: Tensor) -> Tensor:
    mask = attention_mask.unsqueeze(-1).to(sequence.dtype)
    return (sequence * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1.0)


class PhoBERTCrossAttention(nn.Module):
    def __init__(
        self,
        model_name: str,
        num_labels: int = 3,
        heads: int = 8,
        attn_dropout: float = 0.1,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name)
        hidden = self.encoder.config.hidden_size
        self.t2q = CrossAttentionBlock(hidden, heads, attn_dropout, 0.1)
        self.q2t = CrossAttentionBlock(hidden, heads, attn_dropout, 0.1)
        self.classifier = nn.Sequential(
            nn.Linear(hidden * 4 + 1, 512),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(512, 256),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(256, num_labels),
        )

    def forward(
        self,
        text_input_ids: Tensor,
        text_attention_mask: Tensor,
        quote_input_ids: Tensor,
        quote_attention_mask: Tensor,
        quote_present: Tensor,
    ) -> Tensor:
        text_hidden = self.encoder(
            input_ids=text_input_ids, attention_mask=text_attention_mask
        ).last_hidden_state
        quote_hidden = self.encoder(
            input_ids=quote_input_ids, attention_mask=quote_attention_mask
        ).last_hidden_state
        text_pad = text_attention_mask == 0
        quote_pad = quote_attention_mask == 0
        present = quote_present.view(-1, 1, 1).to(text_hidden.dtype)

        text_to_quote = self.t2q(text_hidden, quote_hidden, quote_pad)
        quote_to_text = self.q2t(quote_hidden, text_hidden, text_pad)
        text_to_quote = present * text_to_quote + (1 - present) * text_hidden
        text_mean = masked_mean(text_to_quote, text_attention_mask)
        quote_mean = (
            masked_mean(quote_to_text, quote_attention_mask) * present.squeeze(-1)
        )
        features = torch.cat(
            [
                text_hidden[:, 0, :],
                text_mean,
                quote_mean,
                text_mean * quote_mean,
                present.squeeze(-1),
            ],
            dim=1,
        )
        return self.classifier(features)
