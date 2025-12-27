"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function CategorySpending({ data }) {
  const chartData = Array.isArray(data)
    ? data.map((item) => ({
        category: item.category || "Other",
        amount:
          typeof item.amount === "number"
            ? item.amount
            : typeof item.total === "number"
            ? item.total
            : 0,
      }))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category-wise Spending</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => {
                  const colors = [
                    "#4f46e5",
                    "#22c55e",
                    "#f97316",
                    "#e11d48",
                    "#06b6d4",
                    "#a855f7",
                  ];
                  const color = colors[index % colors.length];
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Pie>
              <Tooltip
                formatter={(value, _name, props) => [
                  `₹${Number(value).toFixed(2)}`,
                  props?.payload?.category || "Amount",
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
