import { useState, useMemo, useEffect, useRef } from "react";
import {
  Layers3,
  Play,
  Download,
  RefreshCw,
  Eye,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  Link2,
  Hash,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import type { BatchTask, BatchGenerateRequest } from "@shared/types";

interface PreviewRow {
  id: string;
  value: string;
  url: string;
}

export default function BatchGenerator() {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://example.com/product?id=");
  const [paramName, setParamName] = useState("id");
  const [valuesText, setValuesText] = useState("P001\nP002\nP003\nP004\nP005");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [task, setTask] = useState<BatchTask | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string>("");
  const pollTimerRef = useRef<number | null>(null);

  const values = useMemo(() => {
    return valuesText
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }, [valuesText]);

  const previewRows: PreviewRow[] = useMemo(() => {
    return values.slice(0, 6).map((v, i) => {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const url = baseUrl + (paramName ? `${sep}${encodeURIComponent(paramName)}=` : "") + encodeURIComponent(v);
      return {
        id: `p-${i}`,
        value: v,
        url,
      };
    });
  }, [values, baseUrl, paramName]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!task || task.status === "done" || task.status === "failed") {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setPolling(false);
      return;
    }
    if (pollTimerRef.current) return;
    setPolling(true);
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const latest = await api.getBatchTask(task.id);
        setTask(latest);
        const pct = latest.totalCount > 0 ? Math.round((latest.successCount / latest.totalCount) * 100) : 0;
        setProgress(pct);
        if (latest.status === "done" || latest.status === "failed") {
          if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPolling(false);
          if (latest.status === "failed") {
            setError("批量任务执行失败");
          }
        }
      } catch {
        // 轮询失败不中断
      }
    }, 1500);
  }, [task]);

  const canGenerate =
    name.trim().length > 0 &&
    baseUrl.trim().length > 0 &&
    baseUrl.startsWith("http") &&
    values.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setProgress(0);
    setError("");
    setTask(null);

    try {
      const payload: BatchGenerateRequest = {
        name,
        baseUrl,
        paramName,
        paramValues: values,
      };
      const created = await api.createBatchTask(payload);
      setTask(created);
      setProgress(created.totalCount > 0 ? Math.round((created.successCount / created.totalCount) * 100) : 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "批量生成失败";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!task) return;
    if (task.status !== "done") {
      alert("任务尚未完成，请等待生成完毕后再下载");
      return;
    }
    try {
      const blob = await api.downloadBatchZip(task.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name || "batch"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("下载失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Layers3 className="w-6 h-6 text-brand-400" />
            批量生成二维码
          </h1>
          <p className="text-dark-400 mt-1 text-sm">
            根据参数值批量生成动态二维码，生成后打包下载
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <div className="card p-5 space-y-5">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-400" />
              任务配置
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">
                  <Hash className="w-3.5 h-3.5 inline mr-1" />
                  任务名称 *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="例如：产品码批量生成-2024春季"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">
                  <Link2 className="w-3.5 h-3.5 inline mr-1" />
                  基础URL *
                </label>
                <input
                  type="text"
                  className="input font-mono text-sm"
                  placeholder="https://example.com/product?id="
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">参数名（可选）</label>
                <input
                  type="text"
                  className="input"
                  placeholder="留空则直接拼接值，例如：id / sku / ref"
                  value={paramName}
                  onChange={(e) => setParamName(e.target.value)}
                />
                <p className="text-xs text-dark-500 mt-1">
                  最终URL = 基础URL + 参数名=参数值（参数名留空时直接拼接参数值）
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="label">
                  参数值（每行一个）*
                  <span className={`ml-2 ${values.length > 0 ? "text-brand-400" : "text-dark-500"}`}>
                    共 {values.length} 条
                  </span>
                </label>
                <textarea
                  className="input font-mono text-sm min-h-[220px] resize-y"
                  placeholder={"SKU001\nSKU002\nSKU003\n..."}
                  value={valuesText}
                  onChange={(e) => setValuesText(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-xs text-dark-500 mt-1">
                  支持最大 1000 条；每行一个参数值，空行会被忽略
                </p>
              </div>
            </div>

            {(progress > 0 || generating || error || task) && (
              <div className="pt-4 border-t border-dark-700">
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-500 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {task ? (
                  task.status === "done" ? (
                    <div className="p-4 rounded-xl bg-success-500/10 border border-success-500/30">
                      <div className="flex items-center gap-2 text-success-500 font-medium mb-3">
                        <CheckCircle2 className="w-5 h-5" />
                        生成成功！共完成 {task.successCount} / {task.totalCount} 个二维码
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                        <div>
                          <span className="text-dark-400">任务ID：</span>
                          <span className="text-white font-mono">{task.id.slice(0, 12)}...</span>
                        </div>
                        <div>
                          <span className="text-dark-400">成功数量：</span>
                          <span className="text-success-500 font-semibold">
                            {task.successCount} / {task.totalCount}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-dark-400">任务名称：</span>
                          <span className="text-white">{task.name}</span>
                        </div>
                      </div>
                      <button onClick={handleDownloadZip} className="btn-success w-full">
                        <Download className="w-4 h-4" />
                        下载 ZIP 压缩包（含全部二维码图片）
                      </button>
                    </div>
                  ) : task.status === "failed" ? (
                    <div className="p-4 rounded-xl bg-danger-500/10 border border-danger-500/30">
                      <div className="flex items-center gap-2 text-danger-500 font-medium mb-2">
                        <AlertCircle className="w-5 h-5" />
                        任务失败
                      </div>
                      <p className="text-sm text-dark-300 mb-3">
                        成功 {task.successCount} / {task.totalCount} 个，请检查参数后重试。
                      </p>
                      <button
                        onClick={() => {
                          setTask(null);
                          setProgress(0);
                        }}
                        className="btn-secondary w-full"
                      >
                        <RefreshCw className="w-4 h-4" />
                        重新生成
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-dark-300 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                          {polling ? "后台正在生成二维码，请勿关闭页面..." : "准备中..."}
                        </span>
                        <span className="text-brand-400 font-semibold">
                          {task.successCount} / {task.totalCount} ({Math.round(progress)}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-dark-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-gradient rounded-full transition-all duration-300 relative"
                          style={{ width: `${progress}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                      </div>
                      <p className="text-xs text-dark-500">
                        任务 ID：<span className="font-mono">{task.id}</span> · 状态：
                        <span className="text-brand-300 ml-1">
                          {task.status === "running" ? "运行中" : task.status === "pending" ? "等待中" : task.status}
                        </span>
                      </p>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-dark-300 flex items-center gap-2">
                        {generating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                            正在生成 {values.length} 个二维码...
                          </>
                        ) : (
                          progress > 0 ? "准备中..." : "等待开始"
                        )}
                      </span>
                      <span className="text-brand-400 font-semibold">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2.5 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gradient rounded-full transition-all duration-300 relative"
                        style={{ width: `${progress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || generating}
                className="btn-primary flex-1 min-w-[180px]"
              >
                {generating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {generating ? "生成中..." : `开始生成 (${values.length} 个)`}
              </button>
              <button
                onClick={() => {
                  setName("");
                  setValuesText("");
                  setProgress(0);
                  setTask(null);
                  setError("");
                }}
                className="btn-secondary"
                disabled={generating}
              >
                <RefreshCw className="w-4 h-4" />
                清空
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-brand-400" />
              预览（前 {previewRows.length} 条）
            </h3>

            {previewRows.length === 0 ? (
              <div className="text-center py-12 text-dark-500 text-sm">
                请输入参数值以预览
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {previewRows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="p-3 rounded-xl bg-dark-900/40 border border-dark-700 flex items-center gap-3 animate-fade-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="w-16 h-16 rounded-lg bg-white p-1.5 flex-shrink-0 border border-dark-600">
                      <QRCodeSVG value={row.url} size={48} level="M" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-dark-700 text-dark-300 font-mono">
                          #{idx + 1}
                        </span>
                        <span className="font-medium text-white truncate">{row.value}</span>
                      </div>
                      <p
                        className="text-xs text-dark-400 truncate font-mono"
                        title={row.url}
                      >
                        {row.url}
                      </p>
                    </div>
                  </div>
                ))}
                {values.length > previewRows.length && (
                  <p className="text-center text-xs text-dark-500 pt-2 pb-1">
                    ... 还有 {values.length - previewRows.length} 条未显示
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card p-5 bg-gradient-to-br from-brand-500/5 to-accent-500/5 border-brand-500/20">
            <h4 className="font-medium text-white mb-2 text-sm">💡 使用提示</h4>
            <ul className="text-xs text-dark-400 space-y-1.5 leading-relaxed">
              <li>• 动态码支持后续修改目标URL，旧二维码依然有效</li>
              <li>• 批量生成默认使用 256px 尺寸和 M 级容错</li>
              <li>• ZIP 中包含 PNG 图片和索引 CSV 文件</li>
              <li>• 如需自定义样式，请在单个编辑中调整</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
