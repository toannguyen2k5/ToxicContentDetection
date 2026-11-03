/**
 * [Owner: C] – Task C-20, C-26
 * Charts: Pie + Bar + Tier distribution + Latency per tier.
 * Dùng Recharts trong dark glassmorphism theme.
 * Fix: encoding UTF-8 chuẩn (không mojibake)
 */
import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from 'recharts'
import { fetchCharts, fetchStats, fetchDatasetStats, type DashboardCharts, type DashboardStats, type DatasetStats } from '../api/client'

// ─── Color tokens ───────────────────────────────────────────────────────────
const COLORS = {
  clean:     '#51cf66',
  offensive: '#ffd43b',
  hate:      '#ff6b6b',
  tier1:     '#74c0fc',
  tier2:     '#da77f2',
  tier3:     '#ffd43b',
}

// ─── Custom dark tooltip ─────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1535', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8, padding: '10px 14px',
      fontSize: '0.82rem', color: '#f1f5f9',
    }}>
      {label && <div style={{ marginBottom: 6, fontWeight: 600 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
        </div>
      ))}
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }: {
  label: string; value: string | number; color: string; sub?: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '16px 20px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function Charts() {
  const [chartData, setChartData] = useState<DashboardCharts | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'runtime' | 'dataset'>('runtime')
  const [dsStats, setDsStats] = useState<DatasetStats | null>(null)
  const [dsLoading, setDsLoading] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [c, s] = await Promise.all([fetchCharts(), fetchStats()])
        if (active) { setChartData(c); setStats(s); setError(null) }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Không tải được dữ liệu.')
      }
    }
    void load()
    const interval = window.setInterval(load, 30_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [])

  // Load dataset stats khi chuyển sang tab Dataset
  useEffect(() => {
    if (tab !== 'dataset' || dsStats) return
    setDsLoading(true)
    fetchDatasetStats().then(d => { setDsStats(d); setDsLoading(false) })
  }, [tab, dsStats])

  // ── Pie data: label distribution
  const pieData = chartData ? [
    { name: 'Clean',     value: chartData.labels.CLEAN,     color: COLORS.clean },
    { name: 'Offensive', value: chartData.labels.OFFENSIVE, color: COLORS.offensive },
    { name: 'Hate',      value: chartData.labels.HATE,      color: COLORS.hate },
  ] : []

  // ── Bar data: daily volume
  const barData = chartData?.daily.map(item => ({
    day: new Date(`${item.date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' }),
    clean: item.clean, offensive: item.offensive, hate: item.hate,
  })) ?? []

  // ── Tier usage bar data
  const tierData = stats?.tiers ? [
    { name: 'Tầng 1 · SVM',     count: stats.tiers[1]?.count ?? 0, avg: Math.round(stats.tiers[1]?.avg_latency_ms ?? 0), fill: COLORS.tier1 },
    { name: 'Tầng 2 · PhoBERT', count: stats.tiers[2]?.count ?? 0, avg: Math.round(stats.tiers[2]?.avg_latency_ms ?? 0), fill: COLORS.tier2 },
    { name: 'Tầng 3 · Qwen',    count: stats.tiers[3]?.count ?? 0, avg: Math.round(stats.tiers[3]?.avg_latency_ms ?? 0), fill: COLORS.tier3 },
  ] : []

  const total = stats?.total ?? chartData?.total ?? 0
  const avgLatency = stats?.avg_latency_ms ? `${Math.round(stats.avg_latency_ms)}ms` : '—'

  // Tab style helper
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 18px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
    fontWeight: active ? 600 : 400,
    background: active ? 'rgba(102,126,234,0.25)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    border: active ? '1px solid rgba(102,126,234,0.4)' : '1px solid transparent',
    transition: 'all 0.2s',
  })

  return (
    <div>
      <div className="page-header">
        <h1>📈 Charts</h1>
        <p>Trực quan hóa runtime predictions và thống kê dataset gán nhãn</p>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(tab === 'runtime')} onClick={() => setTab('runtime')}>
          ⚡ Runtime Predictions
        </button>
        <button style={tabStyle(tab === 'dataset')} onClick={() => setTab('dataset')}>
          📚 Dataset (61,540 rows)
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: RUNTIME
          ══════════════════════════════════════════════════════ */}
      {tab === 'runtime' && (
        <>
          {error && <div className="error-box">⚠️ Không tải được dữ liệu API: {error}</div>}

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard label="Tổng dự đoán" value={total.toLocaleString()} color="var(--accent)" sub="từ extension" />
            <StatCard label="Clean" value={(stats?.labels.CLEAN ?? 0).toLocaleString()} color={COLORS.clean}
              sub={total ? `${((( stats?.labels.CLEAN ?? 0) / total) * 100).toFixed(1)}%` : ''} />
            <StatCard label="Offensive" value={(stats?.labels.OFFENSIVE ?? 0).toLocaleString()} color={COLORS.offensive}
              sub={total ? `${(((stats?.labels.OFFENSIVE ?? 0) / total) * 100).toFixed(1)}%` : ''} />
            <StatCard label="Avg Latency" value={avgLatency} color={COLORS.tier3} sub="end-to-end" />
          </div>

          {/* Row 1: Pie + Daily bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, marginBottom: 20 }}>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>🏷️ Tỷ lệ phân loại tổng thể</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                    paddingAngle={4} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>📅 Lưu lượng quét 7 ngày qua</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{v}</span>} />
                  <Bar dataKey="clean"     stackId="a" fill={COLORS.clean}     name="Clean"     radius={[0,0,4,4]} />
                  <Bar dataKey="offensive" stackId="a" fill={COLORS.offensive} name="Offensive" />
                  <Bar dataKey="hate"      stackId="a" fill={COLORS.hate}      name="Hate"      radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Tier usage + Latency */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>⚡ Phân bổ tầng xử lý (số request)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={tierData} layout="vertical" barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={130} />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="count" name="Số request" radius={[0, 6, 6, 0]}>
                      {tierData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                  💡 Tier 1 nhiều nhất = cascade dừng sớm = hiệu quả
                </div>
              </div>
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>⏱️ Latency trung bình theo tầng (ms)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={tierData} layout="vertical" barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={130} />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="avg" name="Avg (ms)" radius={[0, 6, 6, 0]}>
                      {tierData.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                  💡 Tier 3 (Qwen) chậm nhất do LLM inference
                </div>
              </div>
            </div>
          )}

          {/* Hate radial */}
          {chartData && chartData.labels.HATE > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>🔥 Tỷ lệ Hate Speech trong toxic</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>Hate / (Offensive + Hate)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <ResponsiveContainer width={160} height={160}>
                  <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                    data={[{ name: 'Hate ratio', value: Math.round((chartData.labels.HATE / Math.max(chartData.labels.HATE + chartData.labels.OFFENSIVE, 1)) * 100), fill: COLORS.hate }]}
                    startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="value" cornerRadius={8} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: COLORS.hate, fontSize: '1.4rem', fontWeight: 700 }}>
                      {Math.round((chartData.labels.HATE / Math.max(chartData.labels.HATE + chartData.labels.OFFENSIVE, 1)) * 100)}%
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[{ label: 'Hate', value: chartData.labels.HATE, color: COLORS.hate }, { label: 'Offensive', value: chartData.labels.OFFENSIVE, color: COLORS.offensive }, { label: 'Clean', value: chartData.labels.CLEAN, color: COLORS.clean }].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.color }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', width: 80 }}>{item.label}</span>
                      <strong style={{ color: item.color }}>{item.value.toLocaleString()}</strong>
                      {total > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({((item.value / total) * 100).toFixed(1)}%)</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              📊 Tổng dự đoán từ extension:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{total.toLocaleString()} comment</strong>
              {chartData?.total === 0 && ' · Chưa có dự đoán nào — hãy dùng Chrome extension để quét'}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: DATASET
          ══════════════════════════════════════════════════════ */}
      {tab === 'dataset' && (
        <>
          {dsLoading && (
            <div className="card" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              <span className="spinner" /> Đang tải thống kê dataset...
            </div>
          )}

          {dsStats && !dsLoading && (
            <>
              {/* Dataset Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Tổng mẫu" value={dsStats.total.toLocaleString()} color="var(--accent)" sub="gán nhãn thủ công" />
                <StatCard label="Clean" value={(dsStats.labels.CLEAN ?? 0).toLocaleString()} color={COLORS.clean}
                  sub={`${(((dsStats.labels.CLEAN ?? 0) / dsStats.total) * 100).toFixed(1)}%`} />
                <StatCard label="Offensive" value={(dsStats.labels.OFFENSIVE ?? 0).toLocaleString()} color={COLORS.offensive}
                  sub={`${(((dsStats.labels.OFFENSIVE ?? 0) / dsStats.total) * 100).toFixed(1)}%`} />
                <StatCard label="Hate" value={(dsStats.labels.HATE ?? 0).toLocaleString()} color={COLORS.hate}
                  sub={`${(((dsStats.labels.HATE ?? 0) / dsStats.total) * 100).toFixed(1)}%`} />
              </div>

              {/* Row 1: Label donut + Source bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }}>
                {/* Label donut */}
                <div className="card">
                  <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>🏷️ Phân bổ nhãn dataset</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Clean',     value: dsStats.labels.CLEAN     ?? 0, color: COLORS.clean },
                          { name: 'Offensive', value: dsStats.labels.OFFENSIVE ?? 0, color: COLORS.offensive },
                          { name: 'Hate',      value: dsStats.labels.HATE      ?? 0, color: COLORS.hate },
                        ]}
                        cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                        paddingAngle={4} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {[COLORS.clean, COLORS.offensive, COLORS.hate].map((c, i) => <Cell key={i} fill={c} stroke="transparent" />)}
                      </Pie>
                      <Tooltip content={<DarkTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Source bar */}
                <div className="card">
                  <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>🌐 Nguồn dữ liệu</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dsStats.sources} layout="vertical" barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" name="Số mẫu" fill="var(--accent)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Row 2: Hate category + Pass-7 level */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                {/* Hate category */}
                <div className="card">
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>🚨 Danh mục Hate Speech</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 12 }}>Top 15 hate categories trong dataset</div>
                  {dsStats.hate_categories.length === 0
                    ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Không có dữ liệu hate category</div>
                    : (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={dsStats.hate_categories} layout="vertical" barSize={14}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} />
                          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                          <Bar dataKey="count" name="Số mẫu" fill={COLORS.hate} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>

                {/* Pass-7 level */}
                <div className="card">
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>🎯 Mức độ nhất quán gán nhãn (Pass 7)</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 12 }}>Pass 7 = 7 lần gán nhãn đồng thuận — càng cao càng chắc chắn</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dsStats.pass7_levels} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} width={70} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" name="Số mẫu" fill={COLORS.tier2} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  📂 Nguồn: <code>dataset_full_5_3_2.csv</code> · <strong style={{ color: 'var(--text-primary)' }}>{dsStats.total.toLocaleString()} mẫu</strong> gán nhãn bằng phương pháp Pass-7
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
