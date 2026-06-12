import { useEffect, useState } from "react";
import {
  Download,
  Archive,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  QrCode as QrIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  History,
  FileImage,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QrCode, PagedResult, BatchTask, BatchStatus } from "@shared/types";

const mockQrList: PagedResult<QrCode> = {
  items: Array.from({ length: 10 }, (_, i) => ({
    id: `qr-${i + 1}`,
    name: `示例二维码 ${i + 1}`,
    type: i % 2 === 0 ? "dynamic" : "static",
    targetUrl: `https://example.com/page/${i + 1}`,
    shortCode: `sh${1000 + i}`,
    size: 256,
    foreground: "#0F172A",
    background: "#FFFFFF",
    errorLevel: "M",
    enabled: i !== 3,
    scanCount: Math.floor(Math.random() * 5000),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - i * 43200000).toISOString(),
  })),
  total: 128,
  page: 1,
  pageSize: 10,
};

const mockTasks: BatchTask[] = Array.from({ length: 6 }, (_, i) => ({
  id: `task-${100 - i}`,
  name: `批量导出任务 ${i + 1}`,
  baseUrl: `https://example.com/batch/${i}`,
  paramName: "id",
  totalCount: (i + 1) * 25,
  successCount: i === 2 ? 0 : (i + 1) * 25,
  status: i === 0 ? "running" : i === 2 ? "failed" : ("done" as BatchStatus),
  qrcodeIds: [],
  createdAt: new Date(Date.now() - i * 3600 * 1000 * 5).toISOString(),
}));

const statusMap: Record<BatchStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "等待中", cls: "tag-orange", icon: Clock },
  running: { label: "处理中", cls: "tag-blue", icon: Loader2 },
  done: { label: "已完成", cls: "tag-green", icon: CheckCircle2 },
  failed: { label: "失败", cls: "tag-red", icon: Trash2 },
};

export default function ExportCenter() {
  const [qrList, setQrList] = useState<PagedResult<QrCode>>(mockQrList);
  const [tasks, setTasks] = useState<BatchTask[]>(mockTasks);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .listQrCodes({ page, pageSize: 10 })
      .then(setQrList)
      .catch(() => setQrList({ ...mockQrList, page }))
      .finally(() => setLoading(false));
    api
      .listExportTasks()
      .then((r) => setTasks(r.items))
      .catch(() => setTasks(mockTasks));
  }, [page]);

  const totalPages = Math.ceil(qrList.total / qrList.pageSize);
  const allSelected = qrList.items.length > 0 && qrList.items.every((q) => selected.has(q.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        qrList.items.forEach((q) => next.delete(q.id));
      } else {
        qrList.items.forEach((q) => next.add(q.id));
      }
      return next;
    });
  };

  const handleExport = async (format: "zip" | "csv") => {
    if (selected.size === 0) {
      alert("请至少选择一个二维码");
      return;
    }
    setExporting(true);
    try {
      const blob = await api.exportQrCodes({
        ids: Array.from(selected),
        format,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "zip" ? "zip" : "csv";
      const mime = format === "zip" ? "application/zip" : "text/csv";
      a.download = `qrcodes-export-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTask = (task: BatchTask) => {
    if (task.status !== "done") return;
    api
      .downloadBatchZip(task.id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${task.name || task.id}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("下载失败"));
  };

  const clearSelected = () => setSelected(new Set());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Download className="w-6 h-6 text-brand-400" />
            导出中心
          </h1>
          <p className="text-dark-400 mt-1 text-sm">
            选择二维码批量导出为图片包或数据文件
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="tag-blue">
              已选择 {selected.size} 个
              <button onClick={clearSelected} className="ml-2 hover:text-white opacity-70 hover:opacity-100">
                ×
              </button>
            </span>
          )}
          <button
            onClick={() => handleExport("zip")}
            disabled={selected.size === 0 || exporting}
            className="btn-primary"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            导出 ZIP（图片）
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={selected.size === 0 || exporting}
            className="btn-secondary"
          >
            <FileSpreadsheet className="w-4 h-4" />
            导出 CSV
          </button>
        </div>
      </div>

      <div className="card p-4 border-brand-500/20">
        <div className="flex items-center gap-2 text-sm text-brand-300 mb-3">
          <FileImage className="w-4 h-4" />
          选择要导出的二维码
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="搜索名称、短码..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="text-xs text-dark-400">
            共 <span className="text-white font-semibold">{qrList.total}</span> 个
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/60">
              <tr>
                <th className="table-head w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-dark-900"
                  />
                </th>
                <th className="table-head">二维码</th>
                <th className="table-head">类型</th>
                <th className="table-head">短码</th>
                <th className="table-head">扫码次数</th>
                <th className="table-head">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center py-12 text-dark-500">
                    加载中...
                  </td>
                </tr>
              ) : qrList.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center py-12 text-dark-500">
                    <QrIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>暂无数据</p>
                  </td>
                </tr>
              ) : (
                qrList.items.map((qr) => {
                  const checked = selected.has(qr.id);
                  return (
                    <tr
                      key={qr.id}
                      className={`table-row cursor-pointer ${checked ? "bg-brand-500/5" : ""}`}
                      onClick={() => toggleSelect(qr.id)}
                    >
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(qr.id)}
                          className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-dark-900 cursor-pointer"
                        />
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-white p-1 flex-shrink-0 border border-dark-700">
                            <QrIcon className="w-full h-full text-dark-900" />
                          </div>
                          <span className={`font-medium truncate ${checked ? "text-brand-300" : "text-white"}`}>
                            {qr.name}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        {qr.type === "dynamic" ? (
                          <span className="tag-blue">动态码</span>
                        ) : (
                          <span className="tag-gray">静态码</span>
                        )}
                      </td>
                      <td className="table-cell font-mono text-sm text-brand-400">/{qr.shortCode}</td>
                      <td className="table-cell font-semibold text-white">{qr.scanCount.toLocaleString()}</td>
                      <td className="table-cell text-dark-400 text-xs whitespace-nowrap">
                        {new Date(qr.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-4 border-t border-dark-700 flex-wrap gap-4">
          <p className="text-sm text-dark-400">
            第 {(page - 1) * qrList.pageSize + 1} - {Math.min(page * qrList.pageSize, qrList.total)} 条
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

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-brand-400" />
            <h3 className="font-semibold text-white">历史任务</h3>
            <span className="tag-gray">共 {tasks.length} 个</span>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              api
                .listExportTasks()
                .then((r) => setTasks(r.items))
                .catch(() => setTasks(mockTasks))
                .finally(() => setLoading(false));
            }}
            className="btn-ghost text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/40">
              <tr>
                <th className="table-head">任务</th>
                <th className="table-head">数量</th>
                <th className="table-head">状态</th>
                <th className="table-head">创建时间</th>
                <th className="table-head text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12 text-dark-500">
                    <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>暂无历史任务</p>
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const s = statusMap[t.status];
                  const StatusIcon = s.icon;
                  return (
                    <tr key={t.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-white">{t.name}</p>
                        <p className="text-xs text-dark-500 font-mono mt-0.5">ID: {t.id.slice(0, 16)}...</p>
                      </td>
                      <td className="table-cell">
                        <span className="text-white font-semibold">{t.successCount}</span>
                        <span className="text-dark-500 text-sm"> / {t.totalCount}</span>
                      </td>
                      <td className="table-cell">
                        <span className={s.cls}>
                          <StatusIcon className={`w-3 h-3 ${t.status === "running" ? "animate-spin" : ""}`} />
                          {s.label}
                        </span>
                      </td>
                      <td className="table-cell text-dark-400 text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="table-cell text-right">
                        <button
                          onClick={() => handleDownloadTask(t)}
                          disabled={t.status !== "done"}
                          className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
                        >
                          <Download className="w-4 h-4" />
                          下载
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
