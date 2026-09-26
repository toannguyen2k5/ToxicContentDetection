import React, { useState } from 'react';

export default function Settings() {
  // Quản lý state cho Threshold (mặc định 0.8)
  const [threshold, setThreshold] = useState(0.8);
  
  // Quản lý state cho các Tier
  const [tiers, setTiers] = useState({
    tier1: true,
    tier2: true,
    tier3: false,
  });

  // Hàm xử lý khi bật/tắt checkbox
  const handleTierChange = (e) => {
    const { name, checked } = e.target;
    setTiers((prev) => ({ ...prev, [name]: checked }));
  };

  // Hàm giả lập lưu cấu hình
  const handleSave = (e) => {
    e.preventDefault();
    console.log('Cấu hình đã lưu:', { threshold, tiers });
    // TODO: Gọi API (VD: PUT /api/settings) để lưu cấu hình vào database
    alert('Đã lưu cấu hình thành công!');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* --- Cài đặt Ngưỡng (Threshold) --- */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Ngưỡng độ tin cậy (Confidence Threshold)
          </label>
          <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
            {threshold}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <p className="text-xs text-gray-500 mt-2">
          Hệ thống AI sẽ gắn cờ các nội dung có xác suất vi phạm cao hơn mức này.
        </p>
      </div>

      {/* --- Cài đặt Cấp độ quét (Tiers) --- */}
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-3">
          Cấu hình Pipeline Quét (Tiers)
        </span>
        <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
          
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="tier1"
              checked={tiers.tier1}
              onChange={handleTierChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700 text-sm font-medium">
              Tier 1: Lọc từ khóa nhanh (Cơ bản)
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="tier2"
              checked={tiers.tier2}
              onChange={handleTierChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700 text-sm font-medium">
              Tier 2: Phân tích bằng mô hình AI/NLP (Độ chính xác cao)
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="tier3"
              checked={tiers.tier3}
              onChange={handleTierChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700 text-sm font-medium">
              Tier 3: Kiểm tra ngữ cảnh chuyên sâu (Gọi API ngoài)
            </span>
          </label>
        </div>
      </div>

      {/* --- Nút Lưu --- */}
      <div className="pt-2">
        <button
          type="submit"
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Lưu Cài Đặt
        </button>
      </div>
    </form>
  );
}