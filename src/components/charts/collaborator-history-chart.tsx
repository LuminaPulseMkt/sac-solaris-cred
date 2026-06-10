import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { collaboratorHistory } from "@/mocks/metrics";

export function CollaboratorHistoryChart({ collaboratorId }: { collaboratorId: string }) {
  const data = collaboratorHistory.find((h) => h.collaboratorId === collaboratorId)?.weeks ?? [];
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis hide domain={[0, 100]} />
        <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="score" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
