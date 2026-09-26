/**
 * [Owner: C] — Task C-11 (Test pipeline interactive)
 * Model Tester: gõ comment → xem kết quả từng tầng.
 * T1/T2: "Đang cập nhật" (model chưa train xong).
 * T3: gọi Qwen3-4B qua Ollama (thật).
 *   - Thử FastAPI trước (POST /api/text/classify)
 *   - Nếu FastAPI chưa chạy → gọi thẳng Ollama :11434
 */
import { useState } from 'react'
import axios from 'axios'

const API_BASE    = import.meta.env.VITE_API_URL    ?? 'http://localhost:8000'
const OLLAMA_URL  = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen3-4b-local'

// Prompt giống prompts.py (Python)
const QWEN_PROMPT = `Bạn là chuyên gia phân loại nội dung độc hại trong bình luận mạng xã hội tiếng Việt.

Phân loại bình luận sau vào MỘT trong 3 nhãn:
- CLEAN: bình luận bình thường, không có nội dung xúc phạm hay thù ghét
- OFFENSIVE: xúc phạm, chửi bới một người hoặc nhóm cụ thể
- HATE: kích động thù ghét, kỳ thị theo vùng miền, dân tộc, giới tính, tôn giáo

Hướng dẫn:
- Mia mai, ẩn dụ có ý định xúc phạm rõ ràng → OFFENSIVE hoặc HATE
- Teencode (vl, vcl, dm...) kết hợp xúc phạm → OFFENSIVE
- Kỳ thị cả nhóm người → HATE
- Nếu không chắc → thiên về CLEAN

Bình luận cần phân loại:
{text}

Trả lời ĐÚNG định dạng JSON (không thêm text nào khác):
{"label": "CLEAN|OFFENSIVE|HATE", "confidence": 0.0-1.0, "reason": "giải thích ngắn 1 câu tiếng Việt"}`

// ─── Types ────────────────────────────────────────────────────────────────
type Label = 'CLEAN' | 'OFFENSIVE' | 'HATE'
type TierStatus = 'idle' | 'loading' | 'done' | 'updating'

interface TierResult {
  status: TierStatus
  label?: Label
  confidence?: number
  latency?: number
  reason?: string
}

const LABEL_CLS: Record<Label, string> = {
  CLEAN:     'badge-CLEAN',
  OFFENSIVE: 'badge-OFFENSIVE',
  HATE:      'badge-HATE',
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function parseQwenContent(raw: string): { label: Label; confidence: number; reason: string } {
  let text = raw.trim()

  // Xóa <think>...</think> của Qwen3 thinking mode
  if (text.includes('<think>') && text.includes('</think>')) {
    text = text.split('</think>').slice(-1)[0].trim()
  }

  // Xóa markdown code block
  if (text.includes('```')) {
    for (const part of text.split('```')) {
      const s = part.startsWith('json') ? part.slice(4).trim() : part.trim()
      if (s.startsWith('{')) { text = s; break }
    }
  }

  try {
    const data = JSON.parse(text)
    const valid: Label[] = ['CLEAN', 'OFFENSIVE', 'HATE']
    const label: Label = valid.includes(String(data.label).toUpperCase() as Label)
      ? (String(data.label).toUpperCase() as Label)
      : 'CLEAN'
    const confidence = Math.min(1, Math.max(0, parseFloat(String(data.confidence ?? '0.5'))))
    const reason = String(data.reason ?? '')
    return { label, confidence, reason }
  } catch {
    return { label: 'CLEAN', confidence: 0.5, reason: 'Không parse được phản hồi' }
  }
}

async function callQwen(text: string): Promise<{ label: Label; confidence: number; reason: string; latency: number }> {
  const t0 = Date.now()

  // Thử FastAPI trước (nếu có)
  try {
    const res = await axios.post(
      `${API_BASE}/api/text/classify`,
      { text },
      { timeout: 120_000 }
    )
    const d = res.data?.tier3 ?? res.data
    return {
      label:      d.label      ?? 'CLEAN',
      confidence: d.confidence ?? 0.5,
      reason:     d.reason     ?? '',
      latency:    Date.now() - t0,
    }
  } catch { /* FastAPI chưa chạy → dùng Ollama trực tiếp */ }

  // Fallback: gọi Ollama trực tiếp từ browser
  const body = {
    model: OLLAMA_MODEL,
    messages: [{ role: 'user', content: QWEN_PROMPT.replace('{text}', text) }],
    temperature: 0,
    max_tokens: 150,
    stream: false,
  }
  const res = await axios.post(`${OLLAMA_URL}/v1/chat/completions`, body, {
    timeout: 120_000,
    headers: { 'Content-Type': 'application/json' },
  })
  const content = res.data.choices[0].message.content as string
  return { ...parseQwenContent(content), latency: Date.now() - t0 }
}

function fmtLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// ─── Component ────────────────────────────────────────────────────────────
export default function ModelTester() {
  const [text, setText]     = useState('')
  const [running, setRunning] = useState(false)
  const [t3, setT3]         = useState<TierResult>({ status: 'idle' })
  const [showT1T2, setShowT1T2] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!text.trim() || running) return
    setRunning(true)
    setError(null)
    setT3({ status: 'loading' })
    setShowT1T2(true)

    try {
      const result = await callQwen(text.trim())
      setT3({
        status:     'done',
        label:      result.label,
        confidence: result.confidence,
        reason:     result.reason,
        latency:    result.latency,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
      setError(
        `Không kết nối được Qwen. Kiểm tra:\n` +
        `• Ollama đang chạy: ollama serve\n` +
        `• Model đã import: ollama list\n\n` +
        `Chi tiết lỗi: ${msg}`
      )
      setT3({ status: 'idle' })
      setShowT1T2(false)
    } finally {
      setRunning(false)
    }
  }

  const hasResult = t3.status === 'done' && t3.label

  return (
    <div>
      <div className="page-header">
        <h1>🧪 Model Tester</h1>
        <p>Kiểm tra trực tiếp từng tầng phân loại với bình luận bất kỳ</p>
      </div>

      {/* Input card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <label style={{
          fontSize: '0.85rem', fontWeight: 600,
          color: 'var(--text-secondary)',
          display: 'block', marginBottom: 10,
        }}>
          Nhập bình luận cần phân tích:
        </label>
        <textarea
          id="tester-input"
          className="tester-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ví dụ: tụi miền Bắc chơi game hack toàn thôi..."
          rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAnalyze() }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Ctrl+Enter để gửi · Kết quả T3 (Qwen) là thật, T1/T2 đang cập nhật
          </span>
          <button
            id="btn-analyze"
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={running || !text.trim()}
          >
            {running
              ? <><span className="spinner" />Đang phân tích...</>
              : '🚀 Phân tích'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-box" style={{ whiteSpace: 'pre-line' }}>⚠️ {error}</div>
      )}

      {/* Results table */}
      {showT1T2 && (
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Kết quả từng tầng:
          </div>
          <table className="tier-table">
            <thead>
              <tr>
                <th>Tầng</th>
                <th>Nhãn</th>
                <th>Confidence</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {/* T1 — SVM */}
              <tr>
                <td>
                  <div className="tier-name-cell">Tầng 1 · SVM</div>
                  <div className="tier-sub">TF-IDF + Linear SVM</div>
                </td>
                <td><span className="updating-badge">⏳ Đang cập nhật</span></td>
                <td style={{ color: 'var(--text-secondary)' }}>—</td>
                <td style={{ color: 'var(--text-secondary)' }}>—</td>
              </tr>

              {/* T2 — BERT */}
              <tr>
                <td>
                  <div className="tier-name-cell">Tầng 2 · BERT</div>
                  <div className="tier-sub">ViSoBERT / BAMIBERT</div>
                </td>
                <td><span className="updating-badge">⏳ Đang cập nhật</span></td>
                <td style={{ color: 'var(--text-secondary)' }}>—</td>
                <td style={{ color: 'var(--text-secondary)' }}>—</td>
              </tr>

              {/* T3 — Qwen */}
              <tr>
                <td>
                  <div className="tier-name-cell">Tầng 3 · Qwen3</div>
                  <div className="tier-sub">Qwen3-4B-Q4_K_M (Local)</div>
                </td>
                <td>
                  {t3.status === 'loading' && (
                    <span className="updating-badge"><span className="spinner" />Xử lý...</span>
                  )}
                  {t3.status === 'done' && t3.label && (
                    <span className={`badge ${LABEL_CLS[t3.label]}`}>{t3.label}</span>
                  )}
                </td>
                <td style={{ fontWeight: t3.status === 'done' ? 600 : 400, color: 'var(--text-primary)' }}>
                  {t3.status === 'done' && t3.confidence != null
                    ? `${(t3.confidence * 100).toFixed(0)}%`
                    : '—'}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {t3.status === 'done' && t3.latency != null ? fmtLatency(t3.latency) : '—'}
                </td>
              </tr>

              {/* Kết quả cuối */}
              {hasResult && t3.label && (
                <tr className="final-row">
                  <td>
                    <div className="tier-name-cell" style={{ color: 'var(--accent)' }}>Kết quả cuối</div>
                    <div className="tier-sub">Quyết định bởi Tầng 3</div>
                  </td>
                  <td>
                    <span className={`badge ${LABEL_CLS[t3.label]}`}>{t3.label}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {t3.confidence != null ? `${(t3.confidence * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>

          {/* Lý do từ Qwen */}
          {hasResult && t3.reason && (
            <div className="reason-box">
              <strong>💬 Lý do (Qwen):</strong> {t3.reason}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
