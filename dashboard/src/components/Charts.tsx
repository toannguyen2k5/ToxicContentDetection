/**
 * [Owner: C] — Task C-20, C-26
 * Charts: Pie chart phân bố nhãn + Bar chart lưu lượng 7 ngày.
 * Ported từ Charts.jsx của nhóm → adapted sang glassmorphism theme.
 */
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Màu đồng bộ với badge CSS ───────────────────
const COLORS = {
  clean:     '#51cf66',
  offensive: '#ffa94d',
  hate:      '#ff6b6b',
}

// ─── Mock data ─────────────────────────────────────
const pieData = [
  { name: 'Clean',     value: 12500, color: COLORS.clean     },
  { name: 'Offensive', value: 1420,  color: COLORS.offensive },
  { name: 'Hate',      value: 850,   color: COLORS.hate      },
]

const barData = [
  { day: 'T2', clean: 2000, offensive: 200, hate: 120 },
  { day: 'T3', clean: 1800, offensive: 210, hate: 150 },
  { day: 'T4', clean: 2200, offensive: 180, hate:  90 },
  { day: 'T5', clean: 2100, offensive: 230, hate: 110 },
  { day: 'T6', clean: 2500, offensive: 290, hate: 180 },
  { day: 'T7', clean: 1900, offensive: 250, hate: 140 },
  { day: 'CN', clean: 1600, offensive: 150, hate: 100 },
]

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
  return (
    <div>
      <div className="page-header">
        <h1>📈 Charts</h1>
        <p>Biểu đồ trực quan hóa phân bố nhãn và lưu lượng quét</p>
      </div>

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
            {(12500 + 1420 + 850).toLocaleString()} comment
          </strong>
          {' '}· Mock data — sẽ kết nối FastAPI ở Sprint 6
        </div>
      </div>
    </div>
  )
}
