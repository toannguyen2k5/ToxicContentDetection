import React from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function Charts() {
  // Dữ liệu biểu đồ tròn: Phân bố nhãn
  const pieData = [
    { name: 'Clean', value: 12500, color: '#10B981' }, // Xanh lá
    { name: 'Hate', value: 850, color: '#EF4444' },    // Đỏ
    { name: 'Offensive', value: 1420, color: '#F59E0B' } // Vàng cam
  ];

  // Dữ liệu biểu đồ cột: Lượng dữ liệu quét 7 ngày qua
  const barData = [
    { name: 'T2', clean: 2000, hate: 120, offensive: 200 },
    { name: 'T3', clean: 1800, hate: 150, offensive: 210 },
    { name: 'T4', clean: 2200, hate: 90, offensive: 180 },
    { name: 'T5', clean: 2100, hate: 110, offensive: 230 },
    { name: 'T6', clean: 2500, hate: 180, offensive: 290 },
    { name: 'T7', clean: 1900, hate: 140, offensive: 250 },
    { name: 'CN', clean: 1600, hate: 100, offensive: 150 },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-80">
      {/* Biểu đồ phân bố nhãn (Pie Chart) */}
      <div className="flex flex-col items-center h-full">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Tỷ lệ phân loại tổng thể</h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Biểu đồ theo thời gian (Bar Chart) */}
      <div className="flex flex-col items-center h-full">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Lưu lượng quét 7 ngày qua</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} />
            <RechartsTooltip cursor={{ fill: '#f3f4f6' }} />
            <Legend />
            <Bar dataKey="clean" stackId="a" fill="#10B981" name="Clean" radius={[0, 0, 4, 4]} />
            <Bar dataKey="offensive" stackId="a" fill="#F59E0B" name="Offensive" />
            <Bar dataKey="hate" stackId="a" fill="#EF4444" name="Hate" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}