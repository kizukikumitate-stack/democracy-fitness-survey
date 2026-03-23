'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface RadarDataPoint {
  muscle: string;
  individual: number;
  organization: number;
}

interface SurveyRadarChartProps {
  data: RadarDataPoint[];
  avgData?: RadarDataPoint[];
}

export default function SurveyRadarChart({ data, avgData }: SurveyRadarChartProps) {
  const chartData = data.map((d, i) => ({
    ...d,
    ...(avgData?.[i]
      ? { avgIndividual: avgData[i].individual, avgOrganization: avgData[i].organization }
      : {}),
  }));

  return (
    <ResponsiveContainer width="100%" height={420}>
      <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="muscle"
          tick={{ fontSize: 12, fill: '#374151', fontFamily: 'system-ui, sans-serif' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 5]}
          tickCount={6}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
        />
        <Radar
          name="個人スコア"
          dataKey="individual"
          stroke="#2563EB"
          fill="#2563EB"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <Radar
          name="組織スコア"
          dataKey="organization"
          stroke="#16A34A"
          fill="#16A34A"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        {avgData && (
          <Radar
            name="全体平均（個人）"
            dataKey="avgIndividual"
            stroke="#F97316"
            fill="#F97316"
            fillOpacity={0.05}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}
        {avgData && (
          <Radar
            name="全体平均（組織）"
            dataKey="avgOrganization"
            stroke="#6B7280"
            fill="#6B7280"
            fillOpacity={0.05}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}
        <Legend
          wrapperStyle={{ fontSize: '14px', fontFamily: 'system-ui, sans-serif' }}
        />
        <Tooltip
          formatter={(value, name) => [
            `${Number(value).toFixed(2)}`,
            name,
          ]}
          contentStyle={{
            fontSize: '13px',
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
