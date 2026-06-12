import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  MousePointer,
  Activity,
  TrendingUp,
  CalendarDays,
  Globe,
  RefreshCw,
  BarChart3,
  Smartphone,
} from "lucide-react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { api } from "@/lib/api";
import type { QrCodeStats as QrCodeStatsType, ScanRecord } from "@shared/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const mockData: QrCodeStatsType = {
  qrcode: {
    id: "qr-1",
    name: "产品官网二维码",
    type: "dynamic",
    targetUrl: "https://example.com",
    shortCode: "homepage",
    size: 256,
    foreground: "#0F172A",
    background: "#FFFFFF",
    errorLevel: "M",
    enabled: true,
    scanCount: 12890,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  totalScans: 12890,
  todayScans: 234,
  thisWeekScans: 1486,
  avgDaily: 429,
  trendByDay: Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      count: Math.floor(80 + Math.random() * 400),
    };
  }),
  trendByHour: Array.from({ length: 24 }, (_, i) => ({
    date: `${i.toString().padStart(2, "0")}:00`,
    count: Math.floor(Math.random() * 80),
  })),
  recentRecords: Array.from({ length: 10 }, (_, i) => ({
    id: `scan-${i}`,
    qrcodeId: "qr-1",
    shortCode: "homepage",
    timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString(),
    ip: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    userAgent: i % 3 === 0 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15" : i % 3 === 1 ? "Mozilla/5.0 (Linux; Android 13) Chrome/120.0" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
    referer: i % 2 === 0 ? "https://weixin.qq.com" : undefined,
  })),
};

const deviceFromUA = (ua: string) => {
  if (/iPhone|iPad|iOS/i.test(ua)) return { label: "iOS", cls: "tag-gray" };
  if (/Android/i.test(ua)) return { label: "Android", cls: "tag-green" };
  if (/Windows/i.test(ua)) return { label: "Windows", cls: "tag-blue" };
  if (/Mac/i.test(ua)) return { label: "macOS", cls: "tag-gray" };
  return { label: "其他", cls: "tag-gray" };
};

export default function QrCodeStats() {
  const { id = "" } = useParams();
  const [data, setData] = useState<QrCodeStatsType>(mockData);
  const [loading, setLoading] = useState(true);
  const [recordsPage, setRecordsPage] = useState(1);
  const [records, setRecords] = useState<ScanRecord[]>(mockData.recentRecords);
  const [chartMode, setChartMode] = useState<"day" | "hour">("day");

  useEffect(() => {
    api
      .getQrCodeStats(id)
      .then(setData)
      .catch(() => setData(mockData))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (chartMode === "day") {
      setRecords(data.recentRecords);
    }
  }, [data, chartMode]);

  const statCards = [
    {
      label: "扫码总次数",
      value: data.totalScans.toLocaleString(),
      icon: MousePointer,
      color: "from-brand-500 to-accent-500",
    },
    {
      label: "今日扫码",
      value: data.todayScans.toLocaleString(),
      icon: Activity,
      color: "from-warning-500 to-brand-500",
    },
    {
      label: "本周扫码",
      value: data.thisWeekScans.toLocaleString(),
      icon: CalendarDays,
      color: "from-accent-500 to-success-500",
    },
    {
      label: "日均扫码",
      value: Math.round(data.avgDaily).toLocaleString(),
      icon: TrendingUp,
      color: "from-success-500 to-accent-500",
    },
  ];

  const trendData = chartMode === "day" ? data.trendByDay : data.trendByHour;

  const chartData = {
    labels: trendData.map((t) => t.date),
    datasets: [
      {
        label: "扫码次数",
        data: trendData.map((t) => t.count),
        backgroundColor: "rgba(22, 119, 255, 0.7)",
        borderColor: "#1677FF",
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: "#1677FF",
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
        ticks: { color: "#64748b", font: { size: 11 }, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        ticks: { color: "#64748b", font: { size: 11 } },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  if (loading) {
    return (
      <div className="card p-12 text-center text-dark-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/qrcodes" className="btn-ghost p-2" title="返回列表">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">{data.qrcode.name}</h1>
            <p className="text-dark-400 mt-1 text-sm flex items-center gap-2 flex-wrap">
              <span>短码：<span className="text-brand-400 font-mono">/{data.qrcode.shortCode}</span></span>
              <span className="text-dark-600">·</span>
              <Globe className="w-3.5 h-3.5 inline" />
              <a href={data.qrcode.targetUrl} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline truncate max-w-xs" title={data.qrcode.targetUrl}>
                {data.qrcode.targetUrl}
              </a>
            </p>
          </div>
        </div>
        <Link to={`/qrcodes/${id}/edit`} className="btn-secondary">
          <Edit3 className="w-4 h-4" />
          编辑二维码
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="stat-card animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-dark-400 text-sm">{card.label}</p>
                  <p className="text-3xl font-display font-bold text-white mt-2">{card.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-glow-sm`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-400" />
            <h3 className="font-semibold text-white">扫码趋势统计</h3>
          </div>
          <div className="flex gap-1 bg-dark-900/60 rounded-lg p-1">
            <button
              onClick={() => setChartMode("day")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                chartMode === "day" ? "bg-brand-gradient text-white shadow-glow-sm" : "text-dark-400 hover:text-white"
              }`}
            >
              近14天
            </button>
            <button
              onClick={() => setChartMode("hour")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                chartMode === "hour" ? "bg-brand-gradient text-white shadow-glow-sm" : "text-dark-400 hover:text-white"
              }`}
            >
              今日24小时
            </button>
          </div>
        </div>
        <div className="h-72">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-brand-400" />
          <h3 className="font-semibold text-white">最近扫码记录</h3>
          <span className="tag-gray">显示最近 {records.length} 条</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/40">
              <tr>
                <th className="table-head">时间</th>
                <th className="table-head">IP地址</th>
                <th className="table-head">设备</th>
                <th className="table-head">来源</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-cell text-center py-12 text-dark-500">
                    暂无扫码记录
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const device = deviceFromUA(r.userAgent);
                  return (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell text-white whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="table-cell font-mono text-sm">{r.ip}</td>
                      <td className="table-cell">
                        <span className={device.cls}>{device.label}</span>
                      </td>
                      <td className="table-cell text-dark-300 truncate max-w-[200px]" title={r.referer || r.userAgent}>
                        {r.referer ? (
                          <a href={r.referer} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline">
                            {new URL(r.referer).hostname}
                          </a>
                        ) : (
                          <span className="text-dark-500">直接访问</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {records.length >= 10 && (
          <div className="px-5 py-3 border-t border-dark-700 flex justify-end">
            <button
              onClick={() => setRecordsPage((p) => p + 1)}
              className="btn-secondary text-sm"
            >
              加载更多
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
