import { useEffect, useState } from 'react'
import { fetchStats, type DashboardStats } from '../api/client'

const TIER_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 · TF-IDF SVM',
  2: 'Tier 2 · PhoBERT cross-attention',
  3: 'Tier 3 · Qwen3',
}

export default function ModelStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetchStats()
        if (active) {
          setStats(response)
          setError(null)
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Không thể tải thống kê.')
        }
      }
    }

    void load()
    const interval = window.setInterval(load, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const total = stats?.total ?? 0
  const metrics = [
    { label: 'Tổng dự đoán', value: stats ? total.toLocaleString() : '—', color: 'var(--accent)', bg: 'rgba(102,126,234,0.12)' },
    { label: 'Clean', value: stats ? (stats.labels.CLEAN ?? 0).toLocaleString() : '—', color: 'var(--success)', bg: 'rgba(81,207,102,0.10)' },
    { label: 'Offensive + Hate', value: stats ? ((stats.labels.OFFENSIVE ?? 0) + (stats.labels.HATE ?? 0)).toLocaleString() : '—', color: 'var(--warning)', bg: 'rgba(255,169,77,0.10)' },
    { label: 'Latency trung bình', value: stats ? `${stats.avg_latency_ms.toLocaleString()} ms` : '—', color: '#c084fc', bg: 'rgba(192,132,252,0.10)' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>📊 Model Stats</h1>
        <p>Thống kê dự đoán thực tế ghi nhận từ API · Không phải chỉ số đánh giá trên tập test</p>
      </div>

      {error && <div className="error-box">⚠️ Không tải được dữ liệu API: {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {metrics.map(metric => (
          <div key={metric.label} className="card" style={{ textAlign: 'center', background: metric.bg }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              {metric.label}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: metric.color }}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: '0.9rem' }}>
          Thống kê theo model
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Số lượt xử lý</th>
                <th>Latency trung bình</th>
                <th>Tỷ lệ trên tổng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map(tier => {
                const tierStats = stats?.tiers[tier]
                const count = tierStats?.count ?? 0
                return (
                  <tr key={tier}>
                    <td style={{ fontWeight: 600 }}>{TIER_NAMES[tier]}</td>
                    <td className="col-prob">{stats ? count.toLocaleString() : '—'}</td>
                    <td className="col-prob">
                      {tierStats ? `${tierStats.avg_latency_ms.toLocaleString()} ms` : '—'}
                    </td>
                    <td className="col-prob">
                      {stats && total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {count > 0 ? '✅ Đã xử lý dữ liệu' : 'Chưa có lượt xử lý'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Số liệu được tổng hợp từ lịch sử dự đoán; F1/precision/recall chỉ hiển thị khi có nhãn chuẩn để đánh giá.
        </div>
      </div>
    </div>
  )
}
