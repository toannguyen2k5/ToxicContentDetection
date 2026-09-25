import React from 'react';
import Settings from './components/Settings';
import ModelStats from './components/ModelStats';
import Charts from './components/Charts';
import LogViewer from './components/LogViewer';

export default function App() {
  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        Toxic Content Detection Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2 border-b pb-2">Cài Đặt Bộ Lọc</h2>
          <Settings />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2 border-b pb-2">Hiệu Suất AI</h2>
          <ModelStats />
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 min-h-[300px]">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Phân Tích Thống Kê</h2>
        <Charts />
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Lịch Sử Quét Gần Đây</h2>
        <LogViewer />
      </div>
    </div>
  );
}