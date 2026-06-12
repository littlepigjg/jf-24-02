import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import {
  Upload,
  Save,
  Download,
  RefreshCw,
  X,
  Palette,
  Link2,
  Hash,
  Maximize2,
  ArrowLeft,
  BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QrCode, UpdateQrCodeRequest, ErrorLevel } from "@shared/types";

interface FormState {
  name: string;
  targetUrl: string;
  size: number;
  foreground: string;
  background: string;
  errorLevel: ErrorLevel;
  logoDataUrl?: string;
}

const sizeOptions = [128, 192, 256, 384, 512];
const errorLevelOptions: { value: ErrorLevel; label: string }[] = [
  { value: "L", label: "低 L (~7%)" },
  { value: "M", label: "中 M (~15%)" },
  { value: "Q", label: "较高 Q (~25%)" },
  { value: "H", label: "高 H (~30%)" },
];

export default function QrCodeEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [qr, setQr] = useState<QrCode | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getQrCode(id)
      .then((data) => {
        setQr(data);
        setForm({
          name: data.name,
          targetUrl: data.targetUrl,
          size: data.size,
          foreground: data.foreground,
          background: data.background,
          errorLevel: data.errorLevel,
          logoDataUrl: data.logoDataUrl,
        });
      })
      .catch(() => {
        const mock: QrCode = {
          id,
          name: "示例二维码-编辑",
          type: "dynamic",
          targetUrl: "https://example.com/demo",
          shortCode: "demo123",
          size: 256,
          foreground: "#0F172A",
          background: "#FFFFFF",
          errorLevel: "M",
          enabled: true,
          scanCount: 1234,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setQr(mock);
        setForm({
          name: mock.name,
          targetUrl: mock.targetUrl,
          size: mock.size,
          foreground: mock.foreground,
          background: mock.background,
          errorLevel: mock.errorLevel,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo 图片不能超过 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField("logoDataUrl", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      alert("请输入二维码名称");
      return;
    }
    if (!form.targetUrl || form.targetUrl === "https://" || form.targetUrl === "http://") {
      alert("请输入有效的目标URL");
      return;
    }
    setSaving(true);
    try {
      const payload: UpdateQrCodeRequest = {
        name: form.name,
        targetUrl: form.targetUrl,
        size: form.size,
        foreground: form.foreground,
        background: form.background,
        errorLevel: form.errorLevel,
        logoDataUrl: form.logoDataUrl,
      };
      const updated = await api.updateQrCode(id, payload);
      setQr(updated);
      alert("保存成功");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (qr) {
      setForm({
        name: qr.name,
        targetUrl: qr.targetUrl,
        size: qr.size,
        foreground: qr.foreground,
        background: qr.background,
        errorLevel: qr.errorLevel,
        logoDataUrl: qr.logoDataUrl,
      });
    }
  };

  const handleDownloadPreview = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form?.name || "qrcode"}.png`;
    a.click();
  };

  const handleServerDownload = async (format: "png" | "svg") => {
    if (!qr) return;
    try {
      const blob = await api.downloadQrCode(qr.id, format, form?.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${qr.name}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  if (loading || !form) {
    return (
      <div className="card p-12 text-center text-dark-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
        加载中...
      </div>
    );
  }

  const previewValue = form.targetUrl && form.targetUrl.length > 8 ? form.targetUrl : "https://example.com";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/qrcodes" className="btn-ghost p-2" title="返回列表">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">编辑二维码</h1>
            <p className="text-dark-400 mt-1 text-sm">
              短码：<span className="text-brand-400 font-mono">/{qr?.shortCode}</span>
              {qr?.type === "static" && <span className="tag-gray ml-2">静态码</span>}
              {qr?.type === "dynamic" && <span className="tag-blue ml-2">动态码</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/qrcodes/${id}/stats`} className="btn-secondary">
            <BarChart3 className="w-4 h-4" />
            查看统计
          </Link>
          <button type="button" onClick={handleReset} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            还原
          </button>
          <button type="submit" form="qr-form" className="btn-primary" disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "保存中..." : "保存修改"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form id="qr-form" onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          <div className="card p-5 space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="label">
                  <Hash className="w-3.5 h-3.5 inline mr-1" />
                  二维码名称 *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="例如：活动海报-2024春季"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div>
                <label className="label">
                  <Link2 className="w-3.5 h-3.5 inline mr-1" />
                  目标URL *
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/your-page"
                  value={form.targetUrl}
                  onChange={(e) => updateField("targetUrl", e.target.value)}
                />
                {qr?.type === "static" && (
                  <p className="text-xs text-warning-500 mt-1">
                    ⚠ 静态码已生成，修改目标URL后旧码将失效
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-5">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand-400" />
              样式配置
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  <Maximize2 className="w-3.5 h-3.5 inline mr-1" />
                  尺寸
                </label>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateField("size", s)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        form.size === s
                          ? "bg-brand-gradient text-white shadow-glow-sm"
                          : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                      }`}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">容错级别</label>
                <select
                  className="input"
                  value={form.errorLevel}
                  onChange={(e) => updateField("errorLevel", e.target.value as ErrorLevel)}
                >
                  {errorLevelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">前景色</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="w-12 h-10 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer p-1"
                    value={form.foreground}
                    onChange={(e) => updateField("foreground", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input flex-1 font-mono text-sm"
                    value={form.foreground}
                    onChange={(e) => updateField("foreground", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">背景色</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="w-12 h-10 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer p-1"
                    value={form.background}
                    onChange={(e) => updateField("background", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input flex-1 font-mono text-sm"
                    value={form.background}
                    onChange={(e) => updateField("background", e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="label">中心 Logo （可选，建议2MB以内）</label>
                <div className="flex items-start gap-3 flex-wrap">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                    <Upload className="w-4 h-4" />
                    上传 Logo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  {form.logoDataUrl && (
                    <div className="relative group">
                      <img
                        src={form.logoDataUrl}
                        alt="logo preview"
                        className="w-16 h-16 rounded-lg object-contain bg-white border border-dark-600 p-1"
                      />
                      <button
                        type="button"
                        onClick={() => updateField("logoDataUrl", undefined)}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-dark-500 pt-2">
                    建议使用正方形 PNG，容错级别建议选 Q 或 H
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">实时预览</h3>
              <div className="flex gap-1">
                <button type="button" onClick={handleDownloadPreview} className="btn-secondary text-sm px-3 py-1.5">
                  <Download className="w-4 h-4" />
                  PNG
                </button>
                <button type="button" onClick={() => handleServerDownload("svg")} className="btn-secondary text-sm px-3 py-1.5">
                  <Download className="w-4 h-4" />
                  SVG
                </button>
              </div>
            </div>

            <div
              ref={qrRef}
              className="relative w-full aspect-square rounded-xl p-6 flex items-center justify-center dot-pattern border border-dark-700"
              style={{ background: form.background }}
            >
              <QRCodeCanvas
                value={previewValue}
                size={Math.min(form.size, 360)}
                bgColor={form.background}
                fgColor={form.foreground}
                level={form.logoDataUrl ? (form.errorLevel === "L" || form.errorLevel === "M" ? "H" : form.errorLevel) : form.errorLevel}
                imageSettings={
                  form.logoDataUrl
                    ? {
                        src: form.logoDataUrl,
                        height: Math.round(Math.min(form.size, 360) * 0.2),
                        width: Math.round(Math.min(form.size, 360) * 0.2),
                        excavate: true,
                      }
                    : undefined
                }
              />
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-dark-700">
                <span className="text-dark-400">扫码次数</span>
                <span className="text-brand-400 font-semibold">{qr?.scanCount.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-700">
                <span className="text-dark-400">尺寸</span>
                <span className="text-white">{form.size}px</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-700">
                <span className="text-dark-400">容错</span>
                <span className="text-white">Level {form.errorLevel}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-400">状态</span>
                <span>{qr?.enabled ? <span className="tag-green">已启用</span> : <span className="tag-red">已停用</span>}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
