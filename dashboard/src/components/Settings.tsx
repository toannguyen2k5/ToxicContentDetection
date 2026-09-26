/**
 * [Owner: C] — Task C-24
 * Settings: threshold slider + tier checkboxes.
 * Ported từ Settings.jsx → adapted sang glassmorphism theme.
 * Lưu vào localStorage; TODO Sprint 7: sync với PUT /api/settings
 */
import { useState } from 'react'

interface TierState {
  tier1: boolean
  tier2: boolean
  tier3: boolean
}

const STORAGE_KEY = 'toxic-detector-settings'

function loadSettings(): { threshold: number; tiers: TierState } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { threshold: 0.8, tiers: { tier1: true, tier2: true, tier3: false } }
}

export default function Settings() {
  const saved = loadSettings()
  const [threshold, setThreshold] = useState(saved.threshold)
  const [tiers, setTiers] = useState<TierState>(saved.tiers)
  const [saved_ok, setSavedOk] = useState(false)

  const handleTierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setTiers(prev => ({ ...prev, [name]: checked }))
    setSavedOk(false)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ threshold, tiers }))
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
    // TODO Sprint 7: await axios.put('/api/settings', { threshold, tiers })
  }

  const thresholdPct = `${Math.round(threshold * 100)}%`

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Cấu hình ngưỡng và pipeline quét</p>
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 540 }}>
        {/* Threshold slider */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Confidence Threshold</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Ngưỡng để gắn cờ nội dung vi phạm
              </div>
            </div>
            <div style={{
              fontWeight: 700,
              fontSize: '1.1rem',
              color: 'var(--accent)',
              background: 'rgba(102,126,234,0.15)',
              padding: '4px 14px',
              borderRadius: 20,
              minWidth: 60,
              textAlign: 'center',
            }}>
              {thresholdPct}
            </div>
          </div>

          <input
            type="range"
            min="0" max="1" step="0.05"
            value={threshold}
            onChange={e => { setThreshold(parseFloat(e.target.value)); setSavedOk(false) }}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
              height: 6,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 6 }}>
            <span>0% (nhạy nhất)</span>
            <span>100% (nghiêm ngặt nhất)</span>
          </div>
          <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Hệ thống sẽ gắn cờ các comment có xác suất vi phạm &gt; {thresholdPct}
          </div>
        </div>

        {/* Tier toggles */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 14 }}>
            Cấu hình Pipeline Tiers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              { key: 'tier1', label: 'Tier 1 · SVM', desc: 'TF-IDF + Linear SVM — nhanh, cơ bản', required: true },
              { key: 'tier2', label: 'Tier 2 · BERT', desc: 'ViSoBERT/BAMIBERT — độ chính xác cao', required: false },
              { key: 'tier3', label: 'Tier 3 · Qwen3', desc: 'LLM local — xử lý case khó, chậm hơn', required: false },
            ] as const).map(item => (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: item.required ? 'not-allowed' : 'pointer',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: tiers[item.key] ? 'rgba(102,126,234,0.10)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tiers[item.key] ? 'rgba(102,126,234,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="checkbox"
                  name={item.key}
                  checked={tiers[item.key]}
                  onChange={handleTierChange}
                  disabled={item.required}
                  style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: item.required ? 'not-allowed' : 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.desc}</div>
                </div>
                {item.required && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 10 }}>
                    Bắt buộc
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary" id="btn-save-settings">
            💾 Lưu cài đặt
          </button>
          {saved_ok && (
            <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>
              ✅ Đã lưu thành công!
            </span>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Cài đặt lưu vào localStorage · Sprint 7 sẽ sync với API
        </div>
      </form>
    </div>
  )
}
