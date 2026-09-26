import React, { useState, useEffect } from 'react';

export default function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Giả lập gọi API GET /api/text/logs
  useEffect(() => {
    const fetchLogs = async () => {
      // Thay thế bằng fetch thực tế: const res = await fetch('/api/text/logs');
      setTimeout(() => {
        setLogs([
          { id: 1, text: "Bài viết này rất hữu ích, cảm ơn bạn!", label: "clean", confidence: 0.98, time: "10:23:15" },
          { id: 2, text: "Thằng ngu này, cút ngay đi", label: "hate", confidence: 0.95, time: "10:25:01" },
          { id: 3, text: "Đồ con lợn ăn hại", label: "offensive", confidence: 0.88, time: "10:28:44" },
          { id: 4, text: "Mình không đồng ý với quan điểm trên.", label: "clean", confidence: 0.92, time: "10:30:12" },
          { id: 5, text: "Bọn mày rác rưởi vãi", label: "hate", confidence: 0.91, time: "10:35:50" },
        ]);
        setLoading(false);
      }, 800); // Giả lập độ trễ mạng 800ms
    };

    fetchLogs();
  }, []);

  const getLabelColor = (label) => {
    switch (label) {
      case 'clean': return 'bg-green-100 text-green-800 border-green-200';
      case 'hate': return 'bg-red-100 text-red-800 border-red-200';
      case 'offensive': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="overflow-x-auto">
      {loading ? (
        <div className="text-center py-8 text-gray-500 animate-pulse">
          Đang tải dữ liệu log...
        </div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">Nội dung đã quét</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Phân loại AI</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Độ tin cậy</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {log.time}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 break-words">
                  {log.text}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getLabelColor(log.label)}`}>
                    {log.label.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  {/* Hiển thị màu đỏ nếu confidence thấp hơn threshold (VD: dưới 0.9) */}
                  <span className={log.confidence < 0.9 ? "text-red-500" : "text-gray-700"}>
                    {(log.confidence * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}