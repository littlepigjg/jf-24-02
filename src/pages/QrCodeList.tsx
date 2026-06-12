import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  PlusCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Edit3,
  BarChart3,
  Download,
  Trash2,
  Power,
  QrCode as QrIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QrCode, PagedResult } from "@shared/types";

const mockList: PagedResult<QrCode> = {
  items: Array.from({ length: 8 }, (_, i) => ({
    id: `qr-${i + 1}`,
    name: `示例二维码 ${i + 1}`,
    type: i % 2 === 0 ? "dynamic" : "static",
    targetUrl: `https://example.com/page/${i + 1}`,
    shortCode: `sh${1000 + i}`,
    size: 256,
    foreground: "#0F172A",
    background: "#FFFFFF",
    errorLevel: "M",
    enabled: i !== 6,
    scanCount: Math.floor(Math.random() * 5000),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - i * 43200000).toISOString(),
  })),
  total: 128,
  page: 1,
  pageSize: 10,
};

export default function QrCodeList() {
  const [data, setData] = useState<PagedResult<QrCode>>(mockList);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");

  const fetchData = () => {
    setLoading(true);
    const params: Record<string, unknown> = { page, pageSize: 10 };
    if (keyword) params.keyword = keyword;
    if (typeFilter !== "all") params.type = typeFilter;
    if (enabledFilter !== "all") params.enabled = enabledFilter === "active";
    api
      .listQrCodes(params)
      .then(setData)
      .catch(() => setData({ ...mockList, page }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  const totalPages = Math.ceil(data.total / data.pageSize);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此二维码？")) return;
    try {
      await api.deleteQrCode(id);
      fetchData();
    } catch {
      fetchData();
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.toggleQrCodeEnabled(id);
      fetchData();
    } catch {
      fetchData();
    }
  };

  const handleDownload = async (id: string, name: string) => {
    try {
      const blob = await api.downloadQrCode(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">二维码列表</h1>
          <p className="text-dark-400 mt-1 text-sm">共 {data.total} 个二维码</p>
        </div>
        <Link to="/qrcodes/new" className="btn-primary">
          <PlusCircle className="w-4 h-4" />
          新建二维码
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="搜索名称、URL、短码..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setPage(1), fetchData())}
              className="input pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-dark-500" />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); fetchData(); }}
              className="input w-auto"
            >
              <option value="all">全部类型</option>
              <option value="static">静态码</option>
              <option value="dynamic">动态码</option>
            </select>
            <select
              value={enabledFilter}
              onChange={(e) => { setEnabledFilter(e.target.value); setPage(1); fetchData(); }}
              className="input w-auto"
            >
              <option value="all">全部状态</option>
              <option value="active">已启用</option>
              <option value="inactive">已停用</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/60">
              <tr>
                <th className="table-head">二维码</th>
                <th className="table-head">类型</th>
                <th className="table-head">目标URL / 短码</th>
                <th className="table-head">扫码次数</th>
                <th className="table-head">状态</th>
                <th className="table-head">创建时间</th>
                <th className="table-head text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-dark-500">
                    加载中...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-dark-500">
                    <QrIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>暂无数据</p>
                  </td>
                </tr>
              ) : (
                data.items.map((qr) => (
                  <tr key={qr.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white p-1 flex-shrink-0 border border-dark-700">
                          <QrIcon className="w-full h-full text-dark-900" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate max-w-[200px]">{qr.name}</p>
                          <p className="text-xs text-dark-500">ID: {qr.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      {qr.type === "dynamic" ? (
                        <span className="tag-blue">动态码</span>
                      ) : (
                        <span className="tag-gray">静态码</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <p className="text-xs text-dark-300 truncate max-w-[260px]" title={qr.targetUrl}>
                        {qr.targetUrl}
                      </p>
                      <p className="text-xs text-brand-400 mt-0.5">/{qr.shortCode}</p>
                    </td>
                    <td className="table-cell">
                      <span className="font-semibold text-white">{qr.scanCount.toLocaleString()}</span>
                    </td>
                    <td className="table-cell">
                      {qr.enabled ? (
                        <span className="tag-green">已启用</span>
                      ) : (
                        <span className="tag-red">已停用</span>
                      )}
                    </td>
                    <td className="table-cell text-dark-400 text-xs">
                      {new Date(qr.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost p-1.5"
                          title="下载"
                          onClick={() => handleDownload(qr.id, qr.name)}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <Link
                          to={`/qrcodes/${qr.id}/stats`}
                          className="btn-ghost p-1.5"
                          title="数据统计"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/qrcodes/${qr.id}/edit`}
                          className="btn-ghost p-1.5"
                          title="编辑"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Link>
                        <button
                          className="btn-ghost p-1.5"
                          title={qr.enabled ? "停用" : "启用"}
                          onClick={() => handleToggle(qr.id)}
                        >
                          <Power className={`w-4 h-4 ${qr.enabled ? "text-success-500" : "text-dark-500"}`} />
                        </button>
                        <button
                          className="btn-ghost p-1.5 hover:text-danger-500"
                          title="删除"
                          onClick={() => handleDelete(qr.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-4 border-t border-dark-700 flex-wrap gap-4">
          <p className="text-sm text-dark-400">
            第 {(page - 1) * data.pageSize + 1} - {Math.min(page * data.pageSize, data.total)} 条，
            共 {data.total} 条
          </p>
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary px-2.5 py-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pNum = i + 1;
              if (totalPages > 5) {
                if (page > 3) pNum = page - 2 + i;
                if (page > totalPages - 2) pNum = totalPages - 4 + i;
              }
              if (pNum < 1 || pNum > totalPages) return null;
              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    pNum === page
                      ? "bg-brand-gradient text-white shadow-glow-sm"
                      : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                  }`}
                >
                  {pNum}
                </button>
              );
            })}
            <button
              className="btn-secondary px-2.5 py-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
