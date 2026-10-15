import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '../labels'

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

export interface MonthRow { month: string; revenue: number; expenses: number }

const short = (v: number) =>
  Math.abs(v) >= 1e9 ? `${+(v / 1e9).toFixed(1)} mlrd` : Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)} mln` : String(v)

/** Oylar kesimida tushum va xarajat (ikki seriya, bitta o'q). */
export default function RevenueChart({ data }: { data: MonthRow[] }) {
  const rows = data.map((d) => ({
    ...d,
    revenue: Number(d.revenue),
    expenses: Number(d.expenses),
    label: `${MONTHS[Number(d.month.slice(5)) - 1]} ${d.month.slice(2, 4)}`,
  }))
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--hover)' }}
            formatter={(v) => money(v)}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
            labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--text)' }}
          />
          <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: 'var(--text-2)' }} />
          <Bar dataKey="revenue" name="Tushum" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name="Xarajat" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <details className="chart-table">
        <summary>Jadval ko'rinishi</summary>
        <table className="table compact">
          <thead><tr><th>Oy</th><th className="r">Tushum</th><th className="r">Xarajat</th><th className="r">Foyda</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}><td>{r.label}</td><td className="r">{money(r.revenue)}</td><td className="r">{money(r.expenses)}</td><td className="r">{money(r.revenue - r.expenses)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
