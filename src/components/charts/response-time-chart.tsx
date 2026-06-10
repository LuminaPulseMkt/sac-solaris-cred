import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { responseTimeByHour } from "@/mocks/metrics";

export function ResponseTimeChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={responseTimeByHour} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} unit="s" />
        <Tooltip
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`${v}s`, "Tempo"]}
        />
        <ReferenceLine y={180} stroke="var(--color-danger)" strokeDasharray="4 4" label={{ value: "Meta 3min", fill: "var(--color-danger)", fontSize: 10, position: "right" }} />
        <Line type="monotone" dataKey="seconds" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-brand)" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
