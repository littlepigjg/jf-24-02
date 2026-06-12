import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  QrCode,
  PlusCircle,
  Layers3,
  Download,
  ChevronRight,
  Menu,
  X,
  Zap,
  Bell,
  Search,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/qrcodes", label: "二维码列表", icon: QrCode },
  { to: "/qrcodes/new", label: "创建二维码", icon: PlusCircle },
  { to: "/batch", label: "批量生成", icon: Layers3 },
  { to: "/export", label: "导出中心", icon: Download },
];

const breadcrumbMap: Record<string, { label: string; parent?: string }> = {
  dashboard: { label: "仪表盘" },
  qrcodes: { label: "二维码列表" },
  new: { label: "创建二维码", parent: "qrcodes" },
  edit: { label: "编辑二维码", parent: "qrcodes" },
  stats: { label: "数据统计", parent: "qrcodes" },
  batch: { label: "批量生成" },
  export: { label: "导出中心" },
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  const pathSegments = location.pathname.split("/").filter(Boolean);

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string }[] = [{ label: "首页", to: "/dashboard" }];
    let currentPath = "";
    for (let i = 0; i < pathSegments.length; i++) {
      const seg = pathSegments[i];
      currentPath += "/" + seg;
      const info = breadcrumbMap[seg];
      if (info) {
        if (info.parent && i === 1) {
          const parentIdx = crumbs.findIndex((c) => c.label === breadcrumbMap[info.parent!]?.label);
          if (parentIdx === -1) {
            crumbs.push({ label: breadcrumbMap[info.parent!]?.label || info.parent, to: "/" + info.parent });
          }
        }
        const isId = /^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg);
        if (!isId) {
          crumbs.push({ label: info.label, to: currentPath });
        }
      } else if (!/^[0-9a-f-]{8,}$/i.test(seg) && !/^\d+$/.test(seg)) {
        crumbs.push({ label: seg, to: currentPath });
      }
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen flex">
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } flex-shrink-0 border-r border-dark-700 bg-dark-900/80 backdrop-blur transition-all duration-300 flex flex-col`}
      >
        <div className="h-16 flex items-center px-4 border-b border-dark-700 gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow-sm flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex-col hidden md:flex">
              <span className="font-display font-bold text-lg text-white tracking-tight">QRCode</span>
              <span className="text-xs text-dark-500 -mt-0.5">Management System</span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "nav-item-active" : ""} ${!sidebarOpen ? "justify-center px-0" : ""}`
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-dark-700">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="nav-item w-full"
            title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {sidebarOpen && <span>收起菜单</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-dark-700 bg-dark-900/60 backdrop-blur flex items-center px-6 gap-4">
          <nav className="flex items-center gap-1.5 text-sm flex-shrink-0">
            {breadcrumbs.map((crumb, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="w-4 h-4 text-dark-600" />}
                {crumb.to && idx < breadcrumbs.length - 1 ? (
                  <Link to={crumb.to} className="text-dark-400 hover:text-brand-400 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-white font-medium">{crumb.label}</span>
                )}
              </div>
            ))}
          </nav>

          <div className="flex-1 max-w-md ml-8 hidden lg:block">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                placeholder="搜索二维码、任务..."
                className="input pl-9 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost relative p-2" title="通知">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500" />
            </button>
            <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center text-white text-sm font-semibold shadow-glow-sm">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
