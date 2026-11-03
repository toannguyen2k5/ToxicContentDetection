import { useState } from 'react'
import { predictText, predictDebug, type PredictionLabel, type PredictionResult, type PredictionStage } from '../api/client'

const LABEL_CLS: Record<PredictionLabel, string> = {
  CLEAN: 'badge-CLEAN',
  OFFENSIVE: 'badge-OFFENSIVE',
  HATE: 'badge-HATE',
}

function tierNumber(tier: string): number {
  return Number(tier.match(/\d+/)?.[0] ?? 0)
}

function fmtLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(1)}ms`
}

function formatLabel(label: string): PredictionLabel {
  const normalized = label.toUpperCase()
  return normalized === 'CLEAN' || normalized === 'OFFENSIVE' || normalized === 'HATE'
    ? normalized
    : 'CLEAN'
}

function TierBadge({ stage, running }: { stage?: PredictionStage; running: boolean }) {
  if (running && !stage) {
    return <span className="updating-badge"><span className="spinner" />Đang xử lý...</span>
  }
  if (!stage) return <span style={{ color: 'var(--text-secondary)' }}>—</span>
  const label = formatLabel(stage.label)
  if (label === 'CLEAN' || label === 'OFFENSIVE' || label === 'HATE') {
    return <span className={`badge ${LABEL_CLS[label]}`}>{stage.label}</span>
  }
  // Error hoặc unknown
  return <span style={{ color: '#ff6b6b', fontSize: '0.78rem' }}>{stage.label}</span>
}

export default function ModelTester() {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  const handleAnalyze = async () => {
    if (!text.trim() || running) return
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const res = debugMode
        ? await predictDebug(text.trim())
        : await predictText(text.trim())
      setResult(res)
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
          {/* Debug Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label
              htmlFor="debug-toggle"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', fontSize: '0.8rem',
                color: debugMode ? 'var(--accent)' : 'var(--text-secondary)',
                userSelect: 'none',
              }}
            >
              <div
                id="debug-toggle"
                role="checkbox"
                aria-checked={debugMode}
                tabIndex={0}
                onClick={() => setDebugMode(d => !d)}
                onKeyDown={e => e.key === ' ' && setDebugMode(d => !d)}
                style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: debugMode ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, left: debugMode ? 19 : 3,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </div>
              🔬 Debug mode (chạy cả 3 tầng)
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Ctrl+Enter để gửi
            </span>
            <button
              id="btn-analyze"
              className="btn btn-primary"
              onClick={() => void handleAnalyze()}
              disabled={running || !text.trim()}
            >
              {running
                ? <><span className="spinner" />Đang phân tích...</>
                : debugMode ? '🔬 Debug All Tiers' : '🚀 Phân tích'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-box" style={{ whiteSpace: 'pre-line' }}>⚠️ {error}</div>}

      {(running || result) && (
        <div className="card">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14,
          }}>
            <span>Kết quả từng tầng:</span>
            {result && (
              <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>
                {debugMode
                  ? '🔬 Debug mode — tất cả tầng đều chạy độc lập'
                  : `⚡ Cascade — dừng tại Tầng ${finalTier}`}
              </span>
            )}
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

                const isSkipped = result && !debugMode && !stage
                return (
                  <tr key={tier} style={{ opacity: isSkipped ? 0.45 : 1 }}>
                    <td>
                      <div className="tier-name-cell">Tầng {tier} · {name}</div>
                      <div className="tier-sub">{description}</div>
                    </td>
                    <td>
                      <TierBadge stage={stage} running={running} />
                      {isSkipped && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 6 }}>
                          (bỏ qua)
                        </span>
                      )}
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
                    <div className="tier-sub">
                      {debugMode
                        ? `Cascade quyết định bởi Tầng ${finalTier} · ${fmtLatency(result.latency_ms)} tổng`
                        : `Quyết định bởi Tầng ${finalTier} · ${fmtLatency(result.latency_ms)} tổng`}
                    </div>
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
