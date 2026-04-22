import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Appointment, DashboardSummary, MessageLog, Service } from "./types";

const today = new Date().toISOString().slice(0, 10);

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));

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

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IcWhatsApp = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const IcCalendar = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IcClock = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const IcCheck = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IcX = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IcZap = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IcUsers = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const IcMessage = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const IcPhone = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.0 1.13 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
  </svg>
);

const IcPlus = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IcSend = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IcSettings = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const IcGrid = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IcAlertCircle = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [businessId, setBusinessId] = useState("");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [appointmentForm, setAppointmentForm] = useState({ contactId: "", serviceId: "", startAt: "" });
  const [simulateForm, setSimulateForm] = useState({ fromPhone: "+34655566777", text: "Quiero cita" });
  const [calendarForm, setCalendarForm] = useState({ googleCalendarConnected: false, googleCalendarId: "primary" });

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
      .catch((err: Error) => setError(err.message));
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
      setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard");
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

  const submitAppointment = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    const service = dashboard.services.find((s) => s.id === appointmentForm.serviceId);
    const endAt = service
      ? new Date(new Date(appointmentForm.startAt).getTime() + service.durationMinutes * 60000).toISOString()
      : appointmentForm.startAt;
    await api.createAppointment(dashboard.business.id, { ...appointmentForm, endAt, status: "scheduled", source: "manual" });
    await loadDashboard(dashboard.business.id, date);
  };

  const updateStatus = async (id: string, status: Appointment["status"]) => {
    if (!dashboard) return;
    await api.updateAppointment(dashboard.business.id, id, { status });
    await loadDashboard(dashboard.business.id, date);
  };

  const runAutomations = async () => {
    if (!dashboard) return;
    await api.processAutomations(dashboard.business.id);
    await loadDashboard(dashboard.business.id, date);
  };

  const simulateMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    await api.simulateIncomingMessage(dashboard.business.id, simulateForm);
    await loadDashboard(dashboard.business.id, date);
  };

  const saveCalendar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    await api.updateGoogleCalendar(dashboard.business.id, calendarForm);
    await loadDashboard(dashboard.business.id, date);
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <IcWhatsApp />
          </div>
          <div>
            <div className="sidebar-logo-title">WhatsApp CRM</div>
            <div className="sidebar-logo-sub">TarracoWebs</div>
          </div>
        </div>

        {dashboard && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Canal activo</div>
            <div className="channel-card">
              <div className="channel-name">{dashboard.channel?.displayName ?? "Sin canal"}</div>
              <div className="channel-phone">
                <IcPhone size={11} />
                {dashboard.channel?.phoneE164 ?? "Pendiente de alta"}
              </div>
              <div className="channel-tags">
                <span className="channel-tag">{dashboard.business.plan}</span>
                <span className="channel-tag">{dashboard.business.city}</span>
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-controls">
          <div>
            <div className="sidebar-date-label">Fecha de agenda</div>
            <input
              type="date"
              className="sidebar-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button className="btn-run-automations" type="button" onClick={runAutomations}>
            <IcZap size={13} />
            Procesar automatizaciones
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────── */}
      <main className="content">
        {error && (
          <div className="error-banner">
            <IcAlertCircle size={15} />
            {error}
          </div>
        )}

        {loading || !dashboard ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Cargando panel…</span>
          </div>
        ) : (
          <>
            {/* Page header */}
            <div className="page-header">
              <div className="page-header-left">
                <span className="page-eyebrow">Negocio piloto</span>
                <h1 className="page-title">{dashboard.business.name}</h1>
                <p className="page-subtitle">{dashboard.business.email}</p>
              </div>
              <div className="page-header-right">
                <button className="btn btn-primary" type="button" onClick={() => setBusinessId(dashboard.business.id)}>
                  <IcGrid size={14} />
                  Panel activo
                </button>
              </div>
            </div>

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
                    <span className="card-title-icon teal"><IcCalendar size={14} /></span>
                    Agenda del día
                  </span>
                  <span className="card-badge">{dashboard.appointments.length} citas</span>
                </div>

                {dashboard.appointments.length === 0 ? (
                  <div className="appt-empty">
                    <div className="appt-empty-icon"><IcCalendar size={20} /></div>
                    No hay citas para este día
                  </div>
                ) : (
                  dashboard.appointments.map((appt) => (
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
                      <span className="card-title-icon teal"><IcPlus size={14} /></span>
                      Nueva cita manual
                    </span>
                  </div>
                  <form onSubmit={submitAppointment}>
                    <div className="form-body">
                      <div className="form-row">
                        <div className="field">
                          <label className="field-label">Paciente</label>
                          <select
                            className="field-select"
                            value={appointmentForm.contactId}
                            onChange={(e) => setAppointmentForm((p) => ({ ...p, contactId: e.target.value }))}
                          >
                            {dashboard.contacts.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label className="field-label">Servicio</label>
                          <select
                            className="field-select"
                            value={appointmentForm.serviceId}
                            onChange={(e) => setAppointmentForm((p) => ({ ...p, serviceId: e.target.value }))}
                          >
                            {dashboard.services.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha y hora de inicio</label>
                        <input
                          type="datetime-local"
                          className="field-input"
                          value={appointmentForm.startAt ? appointmentForm.startAt.slice(0, 16) : ""}
                          onChange={(e) =>
                            setAppointmentForm((p) => ({ ...p, startAt: new Date(e.target.value).toISOString() }))
                          }
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
                      <span className="card-title-icon orange"><IcMessage size={14} /></span>
                      Simulador WhatsApp
                    </span>
                  </div>
                  <form onSubmit={simulateMessage}>
                    <div className="form-body">
                      <div className="field">
                        <label className="field-label">Teléfono</label>
                        <input
                          className="field-input"
                          value={simulateForm.fromPhone}
                          onChange={(e) => setSimulateForm((p) => ({ ...p, fromPhone: e.target.value }))}
                          placeholder="+34600000000"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Mensaje</label>
                        <input
                          className="field-input"
                          value={simulateForm.text}
                          onChange={(e) => setSimulateForm((p) => ({ ...p, text: e.target.value }))}
                          placeholder="Escribe un mensaje…"
                        />
                      </div>
                      <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                        <IcSend size={13} />
                        Enviar al flujo
                      </button>
                    </div>
                  </form>
                </div>

                {/* Google Calendar */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <span className="card-title-icon green"><IcCalendar size={14} /></span>
                      Google Calendar
                    </span>
                    <span className="cal-status">
                      <span className={`cal-dot ${dashboard.business.googleCalendarConnected ? "on" : "off"}`} />
                      {dashboard.business.googleCalendarConnected ? "Conectado" : "Desconectado"}
                    </span>
                  </div>
                  <form onSubmit={saveCalendar}>
                    <div className="form-body">
                      <div className="field-checkbox-row">
                        <input
                          type="checkbox"
                          id="cal-toggle"
                          checked={calendarForm.googleCalendarConnected}
                          onChange={(e) => setCalendarForm((p) => ({ ...p, googleCalendarConnected: e.target.checked }))}
                        />
                        <label htmlFor="cal-toggle">Activar sincronización</label>
                      </div>
                      <div className="field">
                        <label className="field-label">Calendar ID</label>
                        <input
                          className="field-input"
                          value={calendarForm.googleCalendarId}
                          onChange={(e) => setCalendarForm((p) => ({ ...p, googleCalendarId: e.target.value }))}
                          placeholder="primary"
                        />
                      </div>
                      <button className="btn btn-secondary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                        <IcSettings size={13} />
                        Guardar configuración
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
                    <span className="card-title-icon orange"><IcMessage size={14} /></span>
                    Últimos mensajes
                  </span>
                  <span className="card-badge">{dashboard.recentMessages.length}</span>
                </div>
                {dashboard.recentMessages.length === 0 ? (
                  <div className="appt-empty">
                    <div className="appt-empty-icon"><IcMessage size={20} /></div>
                    Sin mensajes recientes
                  </div>
                ) : (
                  dashboard.recentMessages.map((msg) => (
                    <MessageRow
                      key={msg.id}
                      message={msg}
                      contactName={contactsById.get(msg.contactId)?.name ?? "Usuario"}
                    />
                  ))
                )}
              </div>

              {/* Services + Availability */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">
                    <span className="card-title-icon purple"><IcGrid size={14} /></span>
                    Servicios del catálogo
                  </span>
                  <span className="card-badge">{dashboard.services.length}</span>
                </div>
                <div className="services-grid">
                  {dashboard.services.map((s) => (
                    <ServiceItem key={s.id} service={s} />
                  ))}
                </div>

                <div className="avail-section-label">Horarios disponibles</div>
                <div className="avail-list">
                  {dashboard.availabilityRules.map((rule) => (
                    <div key={rule.id} className="avail-item">
                      <span className="avail-day">{weekdays[rule.weekday] ?? `Día ${rule.weekday}`}</span>
                      <span className="avail-time">{rule.start} – {rule.end}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div className={`kpi-icon-wrap ${color}`}>{icon}</div>
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
  return (
    <div className="appt-row">
      <div className="appt-avatar">{initials(contactName)}</div>
      <div className="appt-info">
        <div className="appt-name">{contactName}</div>
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
          <button
            type="button"
            className="btn btn-sm btn-confirm"
            onClick={() => onUpdateStatus(appointment.id, "confirmed")}
            title="Confirmar"
          >
            <IcCheck size={11} /> Confirmar
          </button>
          <button
            type="button"
            className="btn btn-sm btn-complete"
            onClick={() => onUpdateStatus(appointment.id, "completed")}
            title="Completar"
          >
            Completar
          </button>
          <button
            type="button"
            className="btn btn-sm btn-cancel"
            onClick={() => onUpdateStatus(appointment.id, "cancelled")}
            title="Cancelar"
          >
            <IcX size={11} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message, contactName }: { message: MessageLog; contactName: string }) {
  return (
    <div className="msg-row">
      <div className={`msg-avatar ${message.direction}`}>{initials(contactName)}</div>
      <div className="msg-content">
        <div className="msg-header">
          <span className="msg-sender">{contactName}</span>
          <span className={`msg-dir-badge ${message.direction}`}>
            {message.direction === "incoming" ? "Recibido" : "Enviado"}
          </span>
          <span className="msg-time">{timeLabel(message.createdAt)}</span>
        </div>
        <div className="msg-body">{message.body}</div>
      </div>
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
