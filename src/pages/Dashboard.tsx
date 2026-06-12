import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  QrCode,
  Activity,
  MousePointer,
  TrendingUp,
  PlusCircle,
  Layers3,
  Download,
  ArrowUpRight,
  Crown,
  BarChart3,
} from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { api } from "@/lib/api";
import type { OverviewStats } from "@shared/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const mockStats: OverviewStats = {
  totalQrCodes: 128,
  activeQrCodes: 105,
  totalScans: 45678,
  todayScans: 892,
  thisWeekScans: 5621,
  topQrCodes: [
    { id: "1", name: "产品官网二维码", scanCount: 12890 },
    { id: "2", name: "活动促销码-A", scanCount: 8723 },
    { id: "3", name: "会员注册入口", scanCount: 6541 },
    { id: "4", name: "售后反馈收集", scanCount: 4320 },
    { id: "5", name: "门店导航-北京", scanCount: 2987 },
  ],
  trendByDay: Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      count: Math.floor(300 + Math.random() * 800),
    };
  }),
};

export default function Dashboard() {
  const [stats, setStats] = useState<OverviewStats>(mockStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOverviewStats().then(setStats).catch(() => setStats(mockStats)).finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      label: "二维码总数",
      value: stats.totalQrCodes,
      icon: QrCode,
      color: "from-brand-500 to-accent-500",
      sub: `启用 ${stats.activeQrCodes} 个`,
    },
    {
      label: "扫码总次数",
      value: stats.totalScans.toLocaleString(),
      icon: MousePointer,
      color: "from-accent-500 to-success-500",
      sub: "历史累计",
    },
    {
      label: "今日扫码",
      value: stats.todayScans.toLocaleString(),
      icon: Activity,
      color: "from-warning-500 to-brand-500",
      sub: "较昨日 +12.5%",
    },
    {
      label: "本周扫码",
      value: stats.thisWeekScans.toLocaleString(),
      icon: TrendingUp,
      color: "from-success-500 to-accent-500",
      sub: "环比 +8.3%",
    },
  ];

  const chartData = {
    labels: stats.trendByDay.map((t) => t.date),
    datasets: [
      {
        label: "扫码次数",
        data: stats.trendByDay.map((t) => t.count),
        borderColor: "#1677FF",
        backgroundColor: "rgba(22, 119, 255, 0.15)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: "#1677FF",
        pointBorderColor: "#0f172a",
        pointBorderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        borderWidth: 1,
        titleColor: "#e2e8f0",
        bodyColor: "#cbd5e1",
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        ticks: { color: "#64748b", font: { size: 11 } },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        ticks: { color: "#64748b", font: { size: 11 } },
        border: { display: false },
      },
    },
  };

  const quickActions = [
    { to: "/qrcodes/new", label: "新建二维码", icon: PlusCircle, primary: true },
    { to: "/batch", label: "批量生成", icon: Layers3, primary: false },
    { to: "/export", label: "导出数据", icon: Download, primary: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">仪表盘</h1>
          <p className="text-dark-400 mt-1 text-sm">欢迎回来，查看你的二维码运营数据</p>
        </div>
        <div className="flex gap-2">
          {quickActions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className={a.primary ? "btn-primary" : "btn-secondary"}
            >
              <a.icon className="w-4 h-4" />
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="stat-card animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-dark-400 text-sm">{card.label}</p>
                  <p className="text-3xl font-display font-bold text-white mt-2 animate-count-up">
                    {loading ? "—" : card.value}
                  </p>
                  <p className="text-dark-500 text-xs mt-2">{card.sub}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-glow-sm`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-400" />
                扫码趋势
              </h3>
              <p className="text-xs text-dark-500 mt-0.5">最近 14 天扫码数据</p>
            </div>
            <span className="tag-blue flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              上升趋势
            </span>
          </div>
          <div className="h-72">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-warning-500" />
              Top 5 扫码排行
            </h3>
            <p className="text-xs text-dark-500 mt-0.5">扫码次数最高的二维码</p>
          </div>
          <div className="space-y-3">
            {stats.topQrCodes.map((item, i) => (
              <Link
                key={item.id}
                to={`/qrcodes/${item.id}/stats`}
                className="flex items-center gap-3 p-3 rounded-lg bg-dark-900/40 hover:bg-dark-700/50 border border-dark-700/50 hover:border-brand-500/30 transition-all group"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    i === 0
                      ? "bg-gradient-to-br from-warning-500 to-brand-500 text-white"
                      : i === 1
                      ? "bg-gradient-to-br from-dark-400 to-dark-500 text-white"
                      : i === 2
                      ? "bg-gradient-to-br from-warning-600 to-warning-500 text-white"
                      : "bg-dark-700 text-dark-400"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate group-hover:text-brand-400 transition-colors">
                    {item.name}
                  </p>
                  <div className="mt-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-gradient rounded-full transition-all duration-700"
                      style={{
                        width: `${(item.scanCount / stats.topQrCodes[0].scanCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-brand-400 flex-shrink-0">
                  {item.scanCount.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
