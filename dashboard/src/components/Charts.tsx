/**
 * [Owner: C] — Task C-20, C-26
 * Charts: Pie chart phân bố nhãn + Bar chart lưu lượng 7 ngày.
 * Ported từ Charts.jsx của nhóm → adapted sang glassmorphism theme.
 */
import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { fetchCharts, type DashboardCharts } from '../api/client'

// ─── Màu đồng bộ với badge CSS ───────────────────
const COLORS = {
  clean:     '#51cf66',
  offensive: '#ffa94d',
  hate:      '#ff6b6b',
}

// Custom tooltip cho dark theme
const DarkTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: {name: string; value: number; color: string}[]; label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1535',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: '0.82rem',
      color: '#f1f5f9',
    }}>
      {label && <div style={{ marginBottom: 6, fontWeight: 600 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  )
}

export default function Charts() {
  const [data, setData] = useState<DashboardCharts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetchCharts()
        if (active) {
          setData(response)
          setError(null)
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Không thể tải dữ liệu biểu đồ.')
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

  const pieData = data ? [
    { name: 'Clean', value: data.labels.CLEAN, color: COLORS.clean },
    { name: 'Offensive', value: data.labels.OFFENSIVE, color: COLORS.offensive },
    { name: 'Hate', value: data.labels.HATE, color: COLORS.hate },
  ] : []
  const barData = data?.daily.map(item => ({
    day: new Date(`${item.date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short' }),
    clean: item.clean,
    offensive: item.offensive,
    hate: item.hate,
  })) ?? []

  return (
    <div>
      <div className="page-header">
        <h1>📈 Charts</h1>
        <p>Biểu đồ từ lịch sử dự đoán thực tế của API</p>
      </div>

      {error && <div className="error-box">⚠️ Không tải được dữ liệu API: {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Pie Chart — Phân bố nhãn */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>
            Tỷ lệ phân loại tổng thể
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={105}
                paddingAngle={4}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart — Lưu lượng 7 ngày */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>
            Lưu lượng quét 7 ngày qua
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{value}</span>
                )}
              />
              <Bar dataKey="clean"     stackId="a" fill={COLORS.clean}     name="Clean"     radius={[0,0,4,4]} />
              <Bar dataKey="offensive" stackId="a" fill={COLORS.offensive} name="Offensive" />
              <Bar dataKey="hate"      stackId="a" fill={COLORS.hate}      name="Hate"      radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tổng số */}
      <div className="card">
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          📊 Tổng dữ liệu:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {(data?.total ?? 0).toLocaleString()} comment
          </strong>
          {!data && ' · Đang tải dữ liệu...'}
          {data?.total === 0 && ' · Chưa có dự đoán nào được ghi nhận'}
        </div>
      </div>
    </div>
  )
}
