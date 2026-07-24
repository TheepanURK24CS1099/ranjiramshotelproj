"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { PayrollModuleProvider } from "@/components/payroll-module-context";

type NavigationItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  payrollOnly?: boolean;
};

const navigationItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/attendance", label: "Attendance" },
  { href: "/reports", label: "Reports" },
  { href: "/employees", label: "Employees" },
  { href: "/shifts", label: "Shifts" },
  { href: "/holidays", label: "Holidays" },
  { href: "/payroll", label: "Payroll", payrollOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
  { href: "/devices", label: "Biometric Device" },
];

function routeDetails(pathname: string) {
  const item = navigationItems.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
  const section = item ?? navigationItems[0];
  const isDetailPage = pathname !== section.href;

  return {
    title: isDetailPage ? `${section.label} Details` : section.label,
    section,
    isDetailPage,
  };
}

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Record<string, string> | null>(null);
  const [payrollEnabled, setPayrollEnabled] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { title, section, isDetailPage } = routeDetails(pathname);

  useEffect(() => {
    Promise.all([apiClient.get("/auth/me"), apiClient.get("/settings/modules")])
      .then(([data, modules]) => {
        setUser(data as Record<string, string>);
        setPayrollEnabled(Boolean((modules as { enabled?: boolean }).enabled));
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      router.push("/login");
    }
  };

  if (!user) {
    return (
      <div className="app-loading" role="status">
        Loading...
      </div>
    );
  }

  const visibleItems = navigationItems.filter(
    (item) =>
      (!item.payrollOnly || payrollEnabled) &&
      (!item.adminOnly || user.role === "ADMIN"),
  );

  const navigation = (
    <nav className="app-navigation" aria-label="Primary navigation">
      {visibleItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`app-nav-link${active ? " app-nav-link-active" : ""}`}
            onClick={closeDrawer}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <PayrollModuleProvider value={{ payrollEnabled, setPayrollEnabled }}>
      <div className="app-shell">
        <aside
          id="app-navigation-drawer"
          className={`app-sidebar${drawerOpen ? " app-sidebar-open" : ""}`}
          aria-label="Application sidebar"
        >
          <div className="app-brand">
            <div className="app-brand-mark" aria-hidden="true">RR</div>
            <div>
              <div className="app-brand-name">Ranjirams Hotel</div>
              <div className="app-brand-subtitle">Management Console</div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="app-drawer-close"
              aria-label="Close navigation menu"
              onClick={closeDrawer}
            >
              <span aria-hidden="true" />
            </button>
          </div>

          {navigation}

          <div className="app-sidebar-account">
            <div className="app-account-label">Signed in as</div>
            <div className="app-account-email" title={user.email}>{user.email}</div>
            <div className="app-account-role">{user.role}</div>
            <button type="button" onClick={handleLogout} className="app-sidebar-logout">
              Logout
            </button>
          </div>
        </aside>

        {drawerOpen && (
          <button
            type="button"
            className="app-drawer-backdrop"
            aria-label="Close navigation menu"
            onClick={closeDrawer}
          />
        )}

        <div className="app-main">
          <header className="app-header">
            <div className="app-header-inner">
              <button
                ref={menuButtonRef}
                type="button"
                className="app-menu-button"
                aria-label="Open navigation menu"
                aria-controls="app-navigation-drawer"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <span aria-hidden="true" />
              </button>

              <div className="app-page-heading">
                <h1>{title}</h1>
                <nav className="app-breadcrumb" aria-label="Breadcrumb">
                  <ol>
                    <li><Link href="/dashboard">Home</Link></li>
                    <li aria-hidden="true">/</li>
                    <li>
                      {isDetailPage ? (
                        <Link href={section.href}>{section.label}</Link>
                      ) : (
                        <span aria-current="page">{section.label}</span>
                      )}
                    </li>
                    {isDetailPage && (
                      <>
                        <li aria-hidden="true">/</li>
                        <li><span aria-current="page">Details</span></li>
                      </>
                    )}
                  </ol>
                </nav>
              </div>

              <div className="app-header-account">
                <div className="app-header-profile">
                  <div className="app-profile-avatar" aria-hidden="true">
                    {(user.email?.[0] ?? "A").toUpperCase()}
                  </div>
                  <div>
                    <div className="app-profile-email">{user.email}</div>
                    <div className="app-profile-role">{user.role}</div>
                  </div>
                </div>
                <button type="button" onClick={handleLogout} className="app-header-logout">
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="app-content">
            <div className="app-content-inner">{children}</div>
          </main>
        </div>
      </div>
    </PayrollModuleProvider>
  );
}
