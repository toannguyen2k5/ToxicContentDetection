/**
 * [Owner: C] — Task C-24, Sprint 7
 * Settings: threshold slider + tier checkboxes.
 * Kết nối thật với PUT/GET /api/settings — persist qua container restart.
 * Hot-reload pipeline thresholds ngay khi lưu (không cần restart).
 */
import { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface ApiSettings {
  threshold_toxic:      number
  threshold_clean:      number
  confidence_threshold: number
  tier1_enabled:        boolean
  tier2_enabled:        boolean
  tier3_enabled:        boolean
}

const DEFAULT: ApiSettings = {
  threshold_toxic:      0.6,
  threshold_clean:      0.15,
  confidence_threshold: 0.80,
  tier1_enabled:        true,
  tier2_enabled:        true,
  tier3_enabled:        false,
}

async function fetchSettings(): Promise<ApiSettings> {
  const res = await axios.get<ApiSettings>(`${API_BASE}/api/settings`)
  return res.data
}

async function saveSettings(data: ApiSettings): Promise<void> {
  await axios.put(`${API_BASE}/api/settings`, data)
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={e => e.key === ' ' && !disabled && onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 4, left: checked ? 22 : 4,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
      }} />
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [status, setStatus]     = useState<'idle' | 'ok' | 'error'>('idle')
  const [error, setError]       = useState<string | null>(null)

  // Load từ API lúc mount
  useEffect(() => {
    fetchSettings()
      .then(data => { setSettings(data); setLoading(false) })
      .catch(err => {
        setError(`Không tải được settings: ${err instanceof Error ? err.message : err}`)
        setLoading(false)
      })
  }, [])

  const set = (key: keyof ApiSettings, value: number | boolean) =>
    setSettings(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setStatus('idle')
    try {
      await saveSettings(settings)
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu')
    } finally {
      setSaving(false)
    }
  }

  const thresholdToxicPct      = `${Math.round(settings.threshold_toxic * 100)}%`
  const thresholdCleanPct      = `${Math.round(settings.threshold_clean * 100)}%`
  const confidenceThresholdPct = `${Math.round(settings.confidence_threshold * 100)}%`

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>⚙️ Settings</h1></div>
        <div className="card" style={{ color: 'var(--text-secondary)' }}>
          <span className="spinner" /> Đang tải cài đặt từ API...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Cấu hình ngưỡng và pipeline — lưu thật vào server, có hiệu lực ngay</p>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <div style={{ maxWidth: 560 }}>
        {/* ── Cascade Thresholds ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 16 }}>
            ⚡ Cascade Pipeline Thresholds
          </div>
          <div style={{
            fontSize: '0.75rem', color: 'var(--text-secondary)',
            background: 'rgba(102,126,234,0.08)', borderRadius: 6,
            padding: '8px 12px', marginBottom: 16,
          }}>
            💡 Pipeline dừng tại Tier 1 nếu score ≥ <strong style={{ color: 'var(--accent)' }}>{thresholdToxicPct}</strong> (toxic) hoặc ≤ <strong style={{ color: '#51cf66' }}>{thresholdCleanPct}</strong> (clean). Ngoài khoảng này → chuyển lên Tier 2.
          </div>

          {/* Toxic threshold */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ngưỡng Toxic</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Score ≥ ngưỡng → kết luận Toxic ngay</div>
              </div>
              <div style={{
                fontWeight: 700, color: '#ff6b6b',
                background: 'rgba(255,107,107,0.12)',
                padding: '3px 12px', borderRadius: 20, fontSize: '0.95rem',
              }}>{thresholdToxicPct}</div>
            </div>
            <input
              type="range" min="0.4" max="1.0" step="0.05"
              value={settings.threshold_toxic}
              onChange={e => set('threshold_toxic', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#ff6b6b', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>
              <span>40% (nhạy)</span><span>100% (chặt)</span>
            </div>
          </div>

          {/* Clean threshold */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ngưỡng Clean</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Score ≤ ngưỡng → kết luận Clean ngay</div>
              </div>
              <div style={{
                fontWeight: 700, color: '#51cf66',
                background: 'rgba(81,207,102,0.12)',
                padding: '3px 12px', borderRadius: 20, fontSize: '0.95rem',
              }}>{thresholdCleanPct}</div>
            </div>
            <input
              type="range" min="0.0" max="0.4" step="0.05"
              value={settings.threshold_clean}
              onChange={e => set('threshold_clean', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#51cf66', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>
              <span>0% (chặt)</span><span>40% (nhạy)</span>
            </div>
          </div>
        </div>

        {/* ── Extension confidence threshold ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>
            🔲 Extension Overlay Threshold
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
            Chrome extension chỉ che comment khi xác suất vi phạm ≥ ngưỡng này
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Confidence threshold</span>
            <div style={{
              fontWeight: 700, color: 'var(--accent)',
              background: 'rgba(102,126,234,0.15)',
              padding: '3px 12px', borderRadius: 20, fontSize: '0.95rem',
            }}>{confidenceThresholdPct}</div>
          </div>
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.confidence_threshold}
            onChange={e => set('confidence_threshold', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>
            <span>0% (nhạy nhất)</span><span>100% (nghiêm ngặt nhất)</span>
          </div>
        </div>

        {/* ── Pipeline Tiers ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 14 }}>
            🔧 Cấu hình Pipeline Tiers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              { key: 'tier1_enabled', label: 'Tier 1 · SVM',    desc: 'TF-IDF + Linear SVM — nhanh, cơ bản',                            value: settings.tier1_enabled },
              { key: 'tier2_enabled', label: 'Tier 2 · PhoBERT', desc: 'PhoBERT cross-attention — phân loại có ngữ cảnh',            value: settings.tier2_enabled },
              { key: 'tier3_enabled', label: 'Tier 3 · Qwen3',   desc: 'LLM local — xử lý case khó, chậm hơn (~4-10s/comment)', value: settings.tier3_enabled },
            ] as const).map(item => (
              <div
                key={item.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: item.value ? 'rgba(102,126,234,0.10)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${item.value ? 'rgba(102,126,234,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.2s',
                }}
              >
                <Toggle
                  checked={item.value as boolean}
                  onChange={v => set(item.key as keyof ApiSettings, v)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.label}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Save ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            id="btn-save-settings"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <><span className="spinner" /> Đang lưu...</> : '💾 Lưu cài đặt'}
          </button>
          {status === 'ok' && (
            <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>
              ✅ Đã lưu — pipeline cập nhật ngay
            </span>
          )}
          {status === 'error' && (
            <span style={{ fontSize: '0.82rem', color: '#ff6b6b' }}>
              ❌ Lỗi khi lưu
            </span>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Cài đặt lưu vào <code>data/settings.json</code> · Có hiệu lực ngay, không cần restart
        </div>
      </div>
    </div>
  )
}
