'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface MusclePoint {
  name: string;
  individual: number;
  organization: number;
}

interface QuadrantMatrixProps {
  data: MusclePoint[];
}

const COLORS = [
  '#2563EB',
  '#DC2626',
  '#D97706',
  '#16A34A',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#65A30D',
  '#EA580C',
  '#6366F1',
];

const MIDPOINT = 3;

// Custom dot with label
const CustomDot = (props: {
  cx?: number;
  cy?: number;
  payload?: MusclePoint;
  index?: number;
}) => {
  const { cx = 0, cy = 0, payload, index = 0 } = props;
  const color = COLORS[index % COLORS.length];
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={color} stroke="white" strokeWidth={2} />
      <text
        x={cx + 12}
        y={cy + 4}
        fontSize={11}
        fill="#374151"
        fontFamily="system-ui, sans-serif"
      >
        {payload?.name}
      </text>
    </g>
  );
};

export default function QuadrantMatrix({ data }: QuadrantMatrixProps) {
  return (
    <div className="w-full">
      <div className="relative">
        {/* Quadrant labels */}
        <div className="absolute inset-0 pointer-events-none z-10" style={{ top: 20, bottom: 30, left: 60, right: 20 }}>
          <div className="relative w-full h-full">
            <div className="absolute top-2 right-2 text-xs text-green-700 font-semibold bg-green-50 px-2 py-1 rounded border border-green-200">
              発揮できている
            </div>
            <div className="absolute top-2 left-2 text-xs text-orange-700 font-semibold bg-orange-50 px-2 py-1 rounded border border-orange-200">
              個人が課題
            </div>
            <div className="absolute bottom-2 right-2 text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-1 rounded border border-blue-200">
              環境が阻害中
            </div>
            <div className="absolute bottom-2 left-2 text-xs text-red-700 font-semibold bg-red-50 px-2 py-1 rounded border border-red-200">
              両方に課題
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 20, right: 80, bottom: 30, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              type="number"
              dataKey="individual"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              name="個人スコア"
              label={{
                value: '個人スコア',
                position: 'insideBottom',
                offset: -15,
                style: { fontSize: '12px', fill: '#374151' },
              }}
            />
            <YAxis
              type="number"
              dataKey="organization"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              name="組織スコア"
              label={{
                value: '組織スコア',
                angle: -90,
                position: 'insideLeft',
                offset: 15,
                style: { fontSize: '12px', fill: '#374151' },
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                if (payload && payload.length > 0) {
                  const d = payload[0].payload as MusclePoint;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
                      <div className="font-semibold text-gray-800 mb-1">{d.name}</div>
                      <div className="text-blue-600">個人: {d.individual.toFixed(2)}</div>
                      <div className="text-green-600">組織: {d.organization.toFixed(2)}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine x={MIDPOINT} stroke="#6b7280" strokeDasharray="4 4" strokeWidth={1.5} />
            <ReferenceLine y={MIDPOINT} stroke="#6b7280" strokeDasharray="4 4" strokeWidth={1.5} />
            <Scatter data={data} shape={(props: unknown) => {
              const typedProps = props as { cx?: number; cy?: number; payload?: MusclePoint; index?: number };
              return <CustomDot {...typedProps} />;
            }}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        {data.map((point, index) => (
          <div key={point.name} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-gray-600 truncate">{point.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
