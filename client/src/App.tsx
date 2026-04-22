import { FormEvent, SVGProps, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Appointment, DashboardSummary, MessageLog, Service } from "./types";

const today = new Date().toISOString().slice(0, 10);

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));

const dateLabel = (d: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d));

const statusLabel: Record<Appointment["status"], string> = {
  pending: "Pendiente",
  scheduled: "Programada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No-show",
};

const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

function hashColor(str: string) {
  const colors = [
    ["#14b8a6", "#0d9488"],
    ["#f97316", "#ea580c"],
    ["#8b5cf6", "#7c3aed"],
    ["#3b82f6", "#2563eb"],
    ["#ec4899", "#db2777"],
    ["#10b981", "#059669"],
    ["#f59e0b", "#d97706"],
    ["#06b6d4", "#0891b2"],
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

// ─── SVG Icons ────────────────────────────────────────────────────────────

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const IcWhatsApp = ({ size = 20, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const IcCalendar = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IcClock = ({ size = 13, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const IcCheck = ({ size = 12, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IcX = ({ size = 12, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IcZap = ({ size = 14, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IcMessage = ({ size = 18, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const IcPhone = ({ size = 12, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
  </svg>
);

const IcPlus = ({ size = 14, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IcSend = ({ size = 14, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IcSettings = ({ size = 18, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const IcGrid = ({ size = 18, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IcChevronLeft = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IcChevronRight = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IcAlertCircle = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IcCheckCircle = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
  </svg>
);

const IcSearch = ({ size = 16, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Toast System ─────────────────────────────────────────────────────────

type Toast = { id: string; type: "success" | "error" | "info"; message: string };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = (type: Toast["type"], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };
  return { toasts, add, remove: (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)) };
}

// ─── Main App ─────────────────────────────────────────────────────────────

function App() {
  const [businessId, setBusinessId] = useState("");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({ contactId: "", serviceId: "", startAt: "" });
  const [simulateForm, setSimulateForm] = useState({ fromPhone: "+34655566777", text: "Quiero cita" });
  const [calendarForm, setCalendarForm] = useState({ googleCalendarConnected: false, googleCalendarId: "primary" });
  const { toasts, add: addToast, remove: removeToast } = useToasts();

  useEffect(() => {
    api.getBusinesses()
      .then((businesses) => {
        if (businesses[0]) {
          setBusinessId(businesses[0].id);
          setCalendarForm({
            googleCalendarConnected: businesses[0].googleCalendarConnected,
            googleCalendarId: businesses[0].googleCalendarId ?? "primary",
          });
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        addToast("error", "Error al cargar negocios");
      });
  }, []);

  const loadDashboard = async (bid: string, d: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard(bid, d);
      setDashboard(data);
      setCalendarForm({
        googleCalendarConnected: data.business.googleCalendarConnected,
        googleCalendarId: data.business.googleCalendarId ?? "primary",
      });
      setAppointmentForm((prev) => ({
        ...prev,
        contactId: data.contacts[0]?.id ?? "",
        serviceId: data.services[0]?.id ?? "",
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo cargar el dashboard";
      setError(msg);
      addToast("error", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (businessId) void loadDashboard(businessId, date);
  }, [businessId, date]);

  const contactsById = useMemo(
    () => new Map((dashboard?.contacts ?? []).map((c) => [c.id, c])),
    [dashboard?.contacts]
  );
  const servicesById = useMemo(
    () => new Map((dashboard?.services ?? []).map((s) => [s.id, s])),
    [dashboard?.services]
  );

  const filteredAppointments = useMemo(
    () =>
      (dashboard?.appointments ?? []).filter(
        (a) =>
          !search ||
          contactsById.get(a.contactId)?.name.toLowerCase().includes(search.toLowerCase()) ||
          servicesById.get(a.serviceId)?.name.toLowerCase().includes(search.toLowerCase())
      ),
    [dashboard?.appointments, search, contactsById, servicesById]
  );

  const submitAppointment = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    try {
      const service = dashboard.services.find((s) => s.id === appointmentForm.serviceId);
      const endAt = service
        ? new Date(new Date(appointmentForm.startAt).getTime() + service.durationMinutes * 60000).toISOString()
        : appointmentForm.startAt;
      await api.createAppointment(dashboard.business.id, { ...appointmentForm, endAt, status: "scheduled", source: "manual" });
      addToast("success", "Cita creada exitosamente");
      await loadDashboard(dashboard.business.id, date);
    } catch (err) {
      addToast("error", "Error al crear cita");
    }
  };

  const updateStatus = async (id: string, status: Appointment["status"]) => {
    if (!dashboard) return;
    try {
      await api.updateAppointment(dashboard.business.id, id, { status });
      addToast("success", `Cita marcada como ${statusLabel[status].toLowerCase()}`);
      await loadDashboard(dashboard.business.id, date);
    } catch (err) {
      addToast("error", "Error al actualizar cita");
    }
  };

  const runAutomations = async () => {
    if (!dashboard) return;
    try {
      await api.processAutomations(dashboard.business.id);
      addToast("success", "Automatizaciones procesadas");
      await loadDashboard(dashboard.business.id, date);
    } catch (err) {
      addToast("error", "Error al procesar automatizaciones");
    }
  };

  const simulateMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    try {
      await api.simulateIncomingMessage(dashboard.business.id, simulateForm);
      addToast("success", "Mensaje simulado");
      setSimulateForm({ fromPhone: "+34655566777", text: "Quiero cita" });
      await loadDashboard(dashboard.business.id, date);
    } catch (err) {
      addToast("error", "Error al simular mensaje");
    }
  };

  const saveCalendar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    try {
      await api.updateGoogleCalendar(dashboard.business.id, calendarForm);
      addToast("success", "Configuración guardada");
      await loadDashboard(dashboard.business.id, date);
    } catch (err) {
      addToast("error", "Error al guardar configuración");
    }
  };

  const prevDate = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const nextDate = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-logo-icon">
            <IcWhatsApp />
          </div>
          <div>
            <div className="sb-logo-title">WhatsApp CRM</div>
            <div className="sb-logo-sub">TarracoWebs</div>
          </div>
        </div>

        <nav className="sb-nav">
          <div className="sb-nav-label">Menú</div>
          <button className="sb-nav-item active">
            <IcGrid size={16} />
            Dashboard
          </button>
          <button className="sb-nav-item">
            <IcCalendar size={16} />
            Agenda
          </button>
          <button className="sb-nav-item">
            <IcMessage size={16} />
            Mensajes
          </button>
          <button className="sb-nav-item">
            <IcSettings size={16} />
            Servicios
          </button>
        </nav>

        {dashboard && (
          <div className="sb-section">
            <div className="sb-section-label">Canal activo</div>
            <div className="channel-card">
              <div className="channel-name">
                <span className="channel-live-dot" />
                {dashboard.channel?.displayName ?? "Sin canal"}
              </div>
              <div className="channel-phone">
                <IcPhone size={10} />
                {dashboard.channel?.phoneE164 ?? "Pendiente"}
              </div>
              <div className="channel-tags">
                <span className="channel-tag">{dashboard.business.plan}</span>
                <span className="channel-tag">{dashboard.business.city}</span>
              </div>
            </div>
          </div>
        )}

        <div className="sb-footer">
          <div className="sb-user-card">
            <div className="sb-user-avatar" style={{ background: `linear-gradient(135deg, ${hashColor(dashboard?.business.name ?? "")[0]}, ${hashColor(dashboard?.business.name ?? "")[1]})` }}>
              {initials(dashboard?.business.name ?? "?")}
            </div>
            <div className="sb-user-info">
              <div className="sb-user-name">{dashboard?.business.name}</div>
              <div className="sb-user-role">{dashboard?.business.plan}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        {!loading && dashboard && (
          <div className="topbar">
            <div className="topbar-title">
              <span className="topbar-label">Panel de control</span>
              <h1 className="topbar-name">{dashboard.business.name}</h1>
            </div>

            <div className="topbar-search">
              <IcSearch className="topbar-search-icon" size={14} />
              <input type="text" placeholder="Buscar citas, contactos…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="topbar-divider" />

            <div className="topbar-actions">
              <div className="date-nav">
                <button className="date-nav-btn" onClick={prevDate} title="Día anterior">
                  <IcChevronLeft size={14} />
                </button>
                <input type="date" className="date-nav-input" value={date} onChange={(e) => setDate(e.target.value)} />
                <button className="date-nav-btn" onClick={nextDate} title="Día siguiente">
                  <IcChevronRight size={14} />
                </button>
              </div>

              <button className="btn-automation-top" onClick={runAutomations} type="button">
                <IcZap size={13} />
                Automations
              </button>
            </div>
          </div>
        )}

        <main className="content">
          {error && (
            <div className="error-banner">
              <IcAlertCircle size={15} />
              {error}
            </div>
          )}

          {loading || !dashboard ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "80px 20px", color: "#94a3b8" }}>
              <div className="spinner" />
              <span>Cargando dashboard…</span>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div className="kpi-grid">
                <KpiCard label="Citas hoy" value={dashboard.metrics.todayAppointments} color="teal" icon={<IcCalendar size={18} />} />
                <KpiCard label="Por confirmar" value={dashboard.metrics.pendingConfirmations} color="orange" icon={<IcClock size={18} />} />
                <KpiCard label="Reseñas pendientes" value={dashboard.metrics.reviewsPending} color="green" icon={<IcCheck size={18} />} />
                <KpiCard label="Flujos abiertos" value={dashboard.metrics.whatsappOpenFlows} color="purple" icon={<IcMessage size={18} />} />
              </div>

              {/* First grid: agenda + forms */}
              <div className="main-grid">
                {/* Agenda */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <span className="card-title-icon teal">
                        <IcCalendar size={14} />
                      </span>
                      Agenda del día
                    </span>
                    <span className="card-badge">{filteredAppointments.length} citas</span>
                  </div>

                  {filteredAppointments.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <IcCalendar size={24} />
                      </div>
                      {search ? "No hay citas que coincidan con la búsqueda" : "No hay citas para este día"}
                    </div>
                  ) : (
                    filteredAppointments.map((appt) => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        contactName={contactsById.get(appt.contactId)?.name ?? "Paciente"}
                        serviceName={servicesById.get(appt.serviceId)?.name ?? "Servicio"}
                        onUpdateStatus={updateStatus}
                      />
                    ))
                  )}
                </div>

                {/* Right column: forms */}
                <div className="stack">
                  {/* New appointment */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">
                        <span className="card-title-icon teal">
                          <IcPlus size={14} />
                        </span>
                        Nueva cita
                      </span>
                    </div>
                    <form onSubmit={submitAppointment}>
                      <div className="form-body">
                        <div className="form-row">
                          <div className="field">
                            <label className="field-label">Paciente</label>
                            <select className="field-select" value={appointmentForm.contactId} onChange={(e) => setAppointmentForm((p) => ({ ...p, contactId: e.target.value }))}>
                              {dashboard.contacts.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label className="field-label">Servicio</label>
                            <select className="field-select" value={appointmentForm.serviceId} onChange={(e) => setAppointmentForm((p) => ({ ...p, serviceId: e.target.value }))}>
                              {dashboard.services.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="field">
                          <label className="field-label">Inicio</label>
                          <input
                            type="datetime-local"
                            className="field-input"
                            value={appointmentForm.startAt ? appointmentForm.startAt.slice(0, 16) : ""}
                            onChange={(e) => setAppointmentForm((p) => ({ ...p, startAt: new Date(e.target.value).toISOString() }))}
                          />
                        </div>
                        <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                          <IcPlus size={13} />
                          Guardar cita
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* WhatsApp simulator */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">
                        <span className="card-title-icon wa">
                          <IcWhatsApp />
                        </span>
                        Simulador
                      </span>
                    </div>
                    <form onSubmit={simulateMessage}>
                      <div className="form-body">
                        <div className="field">
                          <label className="field-label">Teléfono</label>
                          <input className="field-input" value={simulateForm.fromPhone} onChange={(e) => setSimulateForm((p) => ({ ...p, fromPhone: e.target.value }))} />
                        </div>
                        <div className="field">
                          <label className="field-label">Mensaje</label>
                          <input className="field-input" value={simulateForm.text} onChange={(e) => setSimulateForm((p) => ({ ...p, text: e.target.value }))} />
                        </div>
                        <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                          <IcSend size={13} />
                          Enviar
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Google Calendar */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">
                        <span className="card-title-icon green">
                          <IcCalendar size={14} />
                        </span>
                        Google Calendar
                      </span>
                      <span className="cal-status">
                        <span className={`cal-dot ${dashboard.business.googleCalendarConnected ? "on" : "off"}`} />
                      </span>
                    </div>
                    <form onSubmit={saveCalendar}>
                      <div className="form-body">
                        <div className="field-checkbox-row">
                          <div className={`switch ${calendarForm.googleCalendarConnected ? "on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={calendarForm.googleCalendarConnected}
                              onChange={(e) => setCalendarForm((p) => ({ ...p, googleCalendarConnected: e.target.checked }))}
                            />
                          </div>
                          <label className="switch-label">Activar sincronización</label>
                        </div>
                        <div className="field">
                          <label className="field-label">Calendar ID</label>
                          <input className="field-input" value={calendarForm.googleCalendarId} onChange={(e) => setCalendarForm((p) => ({ ...p, googleCalendarId: e.target.value }))} />
                        </div>
                        <button className="btn btn-secondary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                          <IcSettings size={13} />
                          Guardar
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Second grid: messages + catalog */}
              <div className="main-grid">
                {/* Messages */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <span className="card-title-icon wa">
                        <IcMessage size={14} />
                      </span>
                      Últimos mensajes
                    </span>
                    <span className="card-badge">{dashboard.recentMessages.length}</span>
                  </div>
                  {dashboard.recentMessages.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <IcMessage size={24} />
                      </div>
                      Sin mensajes recientes
                    </div>
                  ) : (
                    <ChatBubbles messages={dashboard.recentMessages} contactsById={contactsById} />
                  )}
                </div>

                {/* Services + Availability */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <span className="card-title-icon purple">
                        <IcGrid size={14} />
                      </span>
                      Servicios
                    </span>
                    <span className="card-badge">{dashboard.services.length}</span>
                  </div>
                  <div className="services-grid">
                    {dashboard.services.map((s) => (
                      <ServiceItem key={s.id} service={s} />
                    ))}
                  </div>

                  <div className="avail-section-label">Disponibilidad semanal</div>
                  <div className="avail-weekly">
                    {weekdays.map((day, i) => {
                      const rules = dashboard.availabilityRules.filter((r) => r.weekday === i);
                      return (
                        <div key={i} className="avail-day-col">
                          <span className="avail-day-name">{day}</span>
                          <div className={`avail-day-block ${rules.length > 0 ? "has" : "off"}`}>
                            {rules.length > 0 ? rules[0]?.start.slice(0, 5) : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Toast stack */}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div className="toast-icon">
              {toast.type === "success" && <IcCheckCircle size={14} />}
              {toast.type === "error" && <IcAlertCircle size={14} />}
              {toast.type === "info" && <IcCheckCircle size={14} />}
            </div>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className={`kpi-icon-wrap ${color}`}>{icon}</div>
        <div className={`kpi-trend ${value > 3 ? "up" : value > 0 ? "flat" : "down"}`}>{value > 0 ? "↑" : "—"}</div>
      </div>
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}

function AppointmentRow({
  appointment,
  contactName,
  serviceName,
  onUpdateStatus,
}: {
  appointment: Appointment;
  contactName: string;
  serviceName: string;
  onUpdateStatus: (id: string, status: Appointment["status"]) => Promise<void>;
}) {
  const [colors] = hashColor(contactName);
  return (
    <div className="appt-row">
      <div className="gradient-avatar" style={{ background: `linear-gradient(135deg, ${hashColor(contactName)[0]}, ${hashColor(contactName)[1]})` }}>
        {initials(contactName)}
      </div>
      <div className="appt-info">
        <div className="appt-name">
          {contactName}
          {appointment.source === "whatsapp" && <IcWhatsApp style={{ fontSize: "10px" }} />}
        </div>
        <div className="appt-meta">
          {serviceName}
          <span className="appt-dot" />
          <IcClock size={11} />
          {timeLabel(appointment.startAt)}
        </div>
      </div>
      <div className="appt-right">
        <span className={`badge badge-${appointment.status}`}>{statusLabel[appointment.status]}</span>
        <div className="appt-actions">
          <button type="button" className="btn btn-sm btn-confirm" onClick={() => onUpdateStatus(appointment.id, "confirmed")} title="Confirmar">
            <IcCheck size={11} />
          </button>
          <button type="button" className="btn btn-sm btn-complete" onClick={() => onUpdateStatus(appointment.id, "completed")} title="Completar">
            ✓
          </button>
          <button type="button" className="btn btn-sm btn-cancel" onClick={() => onUpdateStatus(appointment.id, "cancelled")} title="Cancelar">
            <IcX size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubbles({ messages, contactsById }: { messages: MessageLog[]; contactsById: Map<string, any> }) {
  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="chat-empty">Sin mensajes</div>
      ) : (
        messages.map((msg, i) => (
          <div key={msg.id}>
            {i === 0 || new Date(messages[i - 1]!.createdAt).toDateString() !== new Date(msg.createdAt).toDateString() ? (
              <div className="chat-date-sep">{dateLabel(msg.createdAt)}</div>
            ) : null}
            <div className={`chat-bubble ${msg.direction}`}>
              <div className="chat-bubble-sender">{contactsById.get(msg.contactId)?.name ?? "Usuario"}</div>
              <div className="chat-bubble-text">{msg.body}</div>
              <div className="chat-bubble-foot">{timeLabel(msg.createdAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ServiceItem({ service }: { service: Service }) {
  return (
    <div className="service-item">
      <div className="service-name">{service.name}</div>
      <div className="service-duration">
        <IcClock size={11} />
        {service.durationMinutes} min
      </div>
    </div>
  );
}

export default App;
