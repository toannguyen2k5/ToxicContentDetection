import React from 'react';

export default function ModelStats() {
  // Dữ liệu giả lập lấy từ kết quả export của compare_models.ipynb
  const metrics = {
    f1_score: 0.89,
    precision: 0.91,
    recall: 0.87,
    accuracy: 0.90
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* F1 Score */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col items-center justify-center">
        <span className="text-sm font-medium text-gray-500 mb-1">F1 Score</span>
        <span className="text-2xl font-bold text-blue-700">{metrics.f1_score}</span>
      </div>
      
      {/* Precision */}
      <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex flex-col items-center justify-center">
        <span className="text-sm font-medium text-gray-500 mb-1">Precision</span>
        <span className="text-2xl font-bold text-green-700">{metrics.precision}</span>
      </div>

      {/* Recall */}
      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 flex flex-col items-center justify-center">
        <span className="text-sm font-medium text-gray-500 mb-1">Recall</span>
        <span className="text-2xl font-bold text-yellow-700">{metrics.recall}</span>
      </div>

      {/* Accuracy */}
      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 flex flex-col items-center justify-center">
        <span className="text-sm font-medium text-gray-500 mb-1">Accuracy</span>
        <span className="text-2xl font-bold text-purple-700">{metrics.accuracy}</span>
      </div>
    </div>
  );
}