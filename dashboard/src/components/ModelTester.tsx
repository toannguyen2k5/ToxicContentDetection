import { useState } from 'react'
import { predictText, type PredictionLabel, type PredictionResult, type PredictionStage } from '../api/client'

const LABEL_CLS: Record<PredictionLabel, string> = {
  CLEAN: 'badge-CLEAN',
  OFFENSIVE: 'badge-OFFENSIVE',
  HATE: 'badge-HATE',
}

function tierNumber(tier: string): number {
  return Number(tier.match(/\d+/)?.[0] ?? 0)
}

function fmtLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function formatLabel(label: string): PredictionLabel {
  const normalized = label.toUpperCase()
  return normalized === 'CLEAN' || normalized === 'OFFENSIVE' || normalized === 'HATE'
    ? normalized
    : 'CLEAN'
}

export default function ModelTester() {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!text.trim() || running) return
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      setResult(await predictText(text.trim()))
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Lỗi không xác định'
      setError(`Không thể phân tích qua API. Hãy kiểm tra API và các model đã sẵn sàng.\n\nChi tiết lỗi: ${message}`)
    } finally {
      setRunning(false)
    }
  }

  const stagesByTier = new Map<number, PredictionStage>(
    result?.stages.map(stage => [stage.tier, stage]) ?? [],
  )
  const finalTier = result ? tierNumber(result.tier) : 0
  const finalLabel = result ? formatLabel(result.label) : null

  return (
    <div>
      <div className="page-header">
        <h1>🧪 Model Tester</h1>
        <p>Kiểm tra trực tiếp pipeline phân loại thật của API</p>
      </div>

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
          onChange={event => setText(event.target.value)}
          placeholder="Ví dụ: tụi miền Bắc chơi game hack toàn thôi..."
          rows={3}
          onKeyDown={event => { if (event.key === 'Enter' && event.ctrlKey) void handleAnalyze() }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Ctrl+Enter để gửi · Phân tích qua API theo thứ tự SVM → PhoBERT → Qwen
          </span>
          <button
            id="btn-analyze"
            className="btn btn-primary"
            onClick={() => void handleAnalyze()}
            disabled={running || !text.trim()}
          >
            {running
              ? <><span className="spinner" />Đang phân tích...</>
              : '🚀 Phân tích'}
          </button>
        </div>
      </div>

      {error && <div className="error-box" style={{ whiteSpace: 'pre-line' }}>⚠️ {error}</div>}

      {(running || result) && (
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Kết quả từng tầng:
          </div>
          <table className="tier-table">
            <thead>
              <tr>
                <th>Tầng</th>
                <th>Nhãn</th>
                <th>Score / confidence</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map(tier => {
                const stage = stagesByTier.get(tier)
                const name = tier === 1 ? 'SVM' : tier === 2 ? 'PhoBERT cross-attention' : 'Qwen3'
                const description = tier === 1
                  ? 'TF-IDF + Linear SVM'
                  : tier === 2
                    ? 'PhoBERT cross-attention'
                    : 'Qwen qua Ollama'
                return (
                  <tr key={tier}>
                    <td>
                      <div className="tier-name-cell">Tầng {tier} · {name}</div>
                      <div className="tier-sub">{description}</div>
                    </td>
                    <td>
                      {running && !stage
                        ? <span className="updating-badge"><span className="spinner" />Đang xử lý...</span>
                        : stage
                          ? <span className={`badge ${LABEL_CLS[stage.label]}`}>{stage.label}</span>
                          : '—'}
                    </td>
                    <td style={{ color: 'var(--text-primary)' }}>
                      {stage
                        ? `${((stage.confidence ?? stage.score) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {stage ? fmtLatency(stage.latency_ms) : '—'}
                    </td>
                  </tr>
                )
              })}

              {result && finalLabel && (
                <tr className="final-row">
                  <td>
                    <div className="tier-name-cell" style={{ color: 'var(--accent)' }}>Kết quả cuối</div>
                    <div className="tier-sub">Quyết định bởi Tầng {finalTier} · {fmtLatency(result.latency_ms)} tổng</div>
                  </td>
                  <td><span className={`badge ${LABEL_CLS[finalLabel]}`}>{finalLabel}</span></td>
                  <td style={{ fontWeight: 600 }}>{(result.score * 100).toFixed(1)}%</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>

          {result?.stages.find(stage => stage.tier === 3)?.reason && (
            <div className="reason-box">
              <strong>💬 Lý do (Qwen):</strong> {result.stages.find(stage => stage.tier === 3)?.reason}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
