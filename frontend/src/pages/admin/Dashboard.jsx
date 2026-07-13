import { useEffect, useState } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
} from "recharts";
import {
    UsersThree,
    Bird,
    MapPin,
    Coins,
    Ticket as TicketIcon,
    ChatCircleDots,
    Star,
    ShieldWarning,
    ArrowUpRight,
} from "@phosphor-icons/react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";

function KPI({ label, value, icon: Icon, hint, tone = "default" }) {
    const toneColor =
        tone === "primary"
            ? "text-primary"
            : tone === "success"
              ? "text-[hsl(var(--success))]"
              : tone === "warning"
                ? "text-[hsl(var(--warning))]"
                : "text-foreground";
    return (
        <div className="kpi-card" data-testid={`kpi-${label}`}>
            <div className="flex items-center justify-between">
                <p className="label-caps">{label}</p>
                <Icon size={18} weight="duotone" className={toneColor} />
            </div>
            <p className={`font-display text-3xl font-bold mt-3 ${toneColor}`}>
                {value}
            </p>
            {hint && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <ArrowUpRight size={12} /> {hint}
                </p>
            )}
        </div>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get("/admin/stats")
            .then(({ data }) => setStats(data))
            .catch((e) => setError("Kunde inte ladda statistik."));
    }, []);

    return (
        <AdminLayout>
            <div className="mb-8">
                <p className="label-caps mb-2">Admin</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                    Översikt
                </h1>
                <p className="text-muted-foreground mt-1">
                    Nyckeltal och senaste aktivitet i registret.
                </p>
            </div>

            {error && (
                <div className="surface p-4 mb-6 border-destructive/50 text-destructive">
                    {error}
                </div>
            )}

            {!stats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className="kpi-card animate-pulse h-[110px]"
                        />
                    ))}
                </div>
            ) : (
                <>
                    <div
                        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                        data-testid="kpi-grid"
                    >
                        <KPI
                            label="Användare"
                            value={stats.total_users}
                            icon={UsersThree}
                            tone="primary"
                            hint={
                                stats.blocked_users
                                    ? `${stats.blocked_users} blockerade`
                                    : null
                            }
                        />
                        <KPI
                            label="Registrerade fåglar"
                            value={stats.total_registered_birds}
                            icon={Bird}
                        />
                        <KPI
                            label="Hittade rapporter"
                            value={stats.total_found_birds}
                            icon={MapPin}
                        />
                        <KPI
                            label="Betalda"
                            value={stats.paid_birds}
                            icon={Coins}
                            tone="success"
                        />
                        <KPI
                            label="Väntande"
                            value={stats.pending_birds}
                            icon={ShieldWarning}
                            tone="warning"
                        />
                        <KPI
                            label="Intäkter (kr)"
                            value={Math.round(stats.total_revenue)}
                            icon={Coins}
                            tone="primary"
                        />
                        <KPI
                            label="Rabattkoder"
                            value={stats.total_discount_codes}
                            icon={TicketIcon}
                        />
                        <KPI
                            label="Kommentarer"
                            value={stats.total_comments}
                            icon={ChatCircleDots}
                        />
                    </div>

                    <div className="grid lg:grid-cols-3 gap-6">
                        <div
                            className="surface p-6 lg:col-span-2"
                            data-testid="chart-registrations"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <p className="label-caps">Registreringar</p>
                                    <h3 className="font-display text-xl font-bold mt-1">
                                        Senaste 30 dagarna
                                    </h3>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Uppdaterad nyss
                                </span>
                            </div>
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart
                                    data={stats.registrations_series}
                                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient
                                            id="reg-fill"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor="hsl(var(--primary))"
                                                stopOpacity={0.35}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor="hsl(var(--primary))"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="2 4"
                                        vertical={false}
                                        stroke="hsl(var(--border))"
                                    />
                                    <XAxis
                                        dataKey="date"
                                        stroke="hsl(var(--muted-foreground))"
                                        fontSize={11}
                                        tickFormatter={(v) => v.slice(5)}
                                    />
                                    <YAxis
                                        stroke="hsl(var(--muted-foreground))"
                                        fontSize={11}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        fill="url(#reg-fill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div
                            className="surface p-6"
                            data-testid="chart-species"
                        >
                            <div className="mb-6">
                                <p className="label-caps">Vanligaste arter</p>
                                <h3 className="font-display text-xl font-bold mt-1">
                                    Topp 8
                                </h3>
                            </div>
                            {stats.species_top.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Ingen data än.
                                </p>
                            ) : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart
                                        layout="vertical"
                                        data={stats.species_top}
                                        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="2 4"
                                            horizontal={false}
                                            stroke="hsl(var(--border))"
                                        />
                                        <XAxis
                                            type="number"
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={11}
                                            allowDecimals={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="species"
                                            width={110}
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={11}
                                            interval={0}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                background: "hsl(var(--card))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: 8,
                                                fontSize: 12,
                                            }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="hsl(var(--success))"
                                            radius={[0, 4, 4, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </>
            )}
        </AdminLayout>
    );
}
