import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Appointment, DashboardSummary, MessageLog } from "./types";

const today = new Date().toISOString().slice(0, 10);

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(iso));

const dateTimeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(iso));

const weekdayLabel = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const statusLabel: Record<Appointment["status"], string> = {
  pending: "Pendiente",
  scheduled: "Programada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No-show"
};

function App() {
  const [businessId, setBusinessId] = useState("");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [appointmentForm, setAppointmentForm] = useState({
    contactId: "",
    serviceId: "",
    startAtLocal: ""
  });
  const [simulateForm, setSimulateForm] = useState({
    fromPhone: "+34655566777",
    text: "Quiero cita"
  });

  useEffect(() => {
    api
      .getBusinesses()
      .then((businesses) => {
        if (businesses[0]) {
          setBusinessId(businesses[0].id);
        }
      })
      .catch((caughtError: Error) => setError(caughtError.message));
  }, []);

  const loadDashboard = async (selectedBusinessId: string, selectedDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard(selectedBusinessId, selectedDate);
      setDashboard(data);
      setAppointmentForm((current) => ({
        ...current,
        contactId: current.contactId || data.contacts[0]?.id || "",
        serviceId: current.serviceId || data.services[0]?.id || ""
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el panel");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (businessId) {
      void loadDashboard(businessId, date);
    }
  }, [businessId, date]);

  const contactsById = useMemo(
    () => new Map((dashboard?.contacts ?? []).map((contact) => [contact.id, contact])),
    [dashboard?.contacts]
  );
  const servicesById = useMemo(
    () => new Map((dashboard?.services ?? []).map((service) => [service.id, service])),
    [dashboard?.services]
  );

  const nextAppointment = dashboard?.appointments.find((appointment) =>
    ["pending", "scheduled", "confirmed"].includes(appointment.status)
  );

  const fillEndAt = (serviceId: string, startAt: string) => {
    if (!serviceId || !startAt) {
      return "";
    }

    const service = dashboard?.services.find((item) => item.id === serviceId);
    if (!service) {
      return "";
    }

    return new Date(new Date(startAt).getTime() + service.durationMinutes * 60 * 1000).toISOString();
  };

  const submitAppointment = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard || !appointmentForm.startAtLocal) {
      return;
    }

    const startAt = new Date(appointmentForm.startAtLocal).toISOString();

    try {
      await api.createAppointment(dashboard.business.id, {
        contactId: appointmentForm.contactId,
        serviceId: appointmentForm.serviceId,
        startAt,
        endAt: fillEndAt(appointmentForm.serviceId, startAt),
        status: "scheduled",
        source: "manual"
      });
      setAppointmentForm((current) => ({ ...current, startAtLocal: "" }));
      await loadDashboard(dashboard.business.id, date);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo crear la cita");
    }
  };

  const updateStatus = async (appointmentId: string, status: Appointment["status"]) => {
    if (!dashboard) {
      return;
    }

    try {
      await api.updateAppointment(dashboard.business.id, appointmentId, { status });
      await loadDashboard(dashboard.business.id, date);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo actualizar la cita");
    }
  };

  const runAutomations = async () => {
    if (!dashboard) {
      return;
    }

    try {
      await api.processAutomations(dashboard.business.id);
      await loadDashboard(dashboard.business.id, date);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudieron procesar las automatizaciones");
    }
  };

  const simulateMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    try {
      await api.simulateIncomingMessage(dashboard.business.id, simulateForm);
      await loadDashboard(dashboard.business.id, date);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo procesar el mensaje");
    }
  };

  return (
    <div className="app-shell">
      <main className="dashboard-page">
        <header className="topbar">
          <div>
            <p className="eyebrow">TarracoWebs · WhatsApp CRM</p>
            <h1>Dashboard diario</h1>
            <p className="muted">Simple, operativo y centrado en citas, mensajes y automatizaciones.</p>
          </div>
          <div className="topbar-actions">
            <label className="field inline-field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <button className="secondary" onClick={runAutomations} type="button">
              Procesar automatizaciones
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading || !dashboard ? (
          <div className="loading-card">Cargando panel...</div>
        ) : (
          <>
            <section className="hero-card">
              <div className="hero-copy">
                <p className="eyebrow">Negocio activo</p>
                <h2>{dashboard.business.name}</h2>
                <p className="muted">
                  {dashboard.business.city} · {dashboard.business.email}
                </p>
                <div className="pill-row">
                  <span className="pill">{dashboard.business.plan}</span>
                  <span className="pill">
                    {dashboard.channel?.phoneE164 ? `WhatsApp ${dashboard.channel.phoneE164}` : "Canal pendiente"}
                  </span>
                </div>
              </div>

              <div className="hero-aside">
                <div className="summary-tile">
                  <span className="summary-label">Próxima cita</span>
                  <strong>{nextAppointment ? timeLabel(nextAppointment.startAt) : "Sin citas activas"}</strong>
                  <span className="muted">
                    {nextAppointment
                      ? contactsById.get(nextAppointment.contactId)?.name ?? "Paciente"
                      : "La agenda está despejada"}
                  </span>
                </div>
                <div className="summary-tile">
                  <span className="summary-label">Canal</span>
                  <strong>{dashboard.channel?.displayName ?? "No configurado"}</strong>
                  <span className="muted">
                    {dashboard.channel?.templatesReady ? "Plantillas listas" : "Pendiente de plantillas"}
                  </span>
                </div>
              </div>
            </section>

            <section className="metrics-grid">
              <MetricCard label="Citas hoy" value={dashboard.metrics.todayAppointments} tone="ocean" />
              <MetricCard label="Por confirmar" value={dashboard.metrics.pendingConfirmations} tone="sand" />
              <MetricCard label="Reseñas pendientes" value={dashboard.metrics.reviewsPending} tone="moss" />
              <MetricCard label="Flujos abiertos" value={dashboard.metrics.whatsappOpenFlows} tone="wine" />
            </section>

            <section className="main-grid">
              <section className="panel panel-main">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Agenda diaria</p>
                    <h3>Citas del día</h3>
                  </div>
                  <span className="muted">{dashboard.appointments.length} citas</span>
                </div>

                <div className="agenda-list">
                  {dashboard.appointments.length ? (
                    dashboard.appointments.map((appointment) => (
                      <article key={appointment.id} className="agenda-row">
                        <div className="agenda-time">
                          <strong>{timeLabel(appointment.startAt)}</strong>
                          <span>{servicesById.get(appointment.serviceId)?.durationMinutes ?? 0} min</span>
                        </div>

                        <div className="agenda-body">
                          <div className="agenda-main">
                            <strong>{contactsById.get(appointment.contactId)?.name ?? "Paciente"}</strong>
                            <p>{servicesById.get(appointment.serviceId)?.name ?? "Servicio"}</p>
                          </div>
                          <span className={`status-chip status-${appointment.status}`}>{statusLabel[appointment.status]}</span>
                        </div>

                        <div className="agenda-actions">
                          <button type="button" onClick={() => updateStatus(appointment.id, "confirmed")}>
                            Confirmar
                          </button>
                          <button type="button" onClick={() => updateStatus(appointment.id, "completed")}>
                            Completar
                          </button>
                          <button type="button" onClick={() => updateStatus(appointment.id, "cancelled")}>
                            Cancelar
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">No hay citas para esta fecha.</div>
                  )}
                </div>
              </section>

              <aside className="side-column">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Alta rápida</p>
                      <h3>Nueva cita</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={submitAppointment}>
                    <label className="field">
                      <span>Paciente</span>
                      <select
                        value={appointmentForm.contactId}
                        onChange={(event) =>
                          setAppointmentForm((current) => ({ ...current, contactId: event.target.value }))
                        }
                      >
                        {dashboard.contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Servicio</span>
                      <select
                        value={appointmentForm.serviceId}
                        onChange={(event) =>
                          setAppointmentForm((current) => ({ ...current, serviceId: event.target.value }))
                        }
                      >
                        {dashboard.services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Fecha y hora</span>
                      <input
                        type="datetime-local"
                        value={appointmentForm.startAtLocal}
                        onChange={(event) =>
                          setAppointmentForm((current) => ({
                            ...current,
                            startAtLocal: event.target.value
                          }))
                        }
                      />
                    </label>

                    <button className="primary" type="submit">
                      Guardar cita
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">WhatsApp</p>
                      <h3>Simular entrada</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={simulateMessage}>
                    <label className="field">
                      <span>Teléfono</span>
                      <input
                        value={simulateForm.fromPhone}
                        onChange={(event) => setSimulateForm((current) => ({ ...current, fromPhone: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Mensaje</span>
                      <input
                        value={simulateForm.text}
                        onChange={(event) => setSimulateForm((current) => ({ ...current, text: event.target.value }))}
                      />
                    </label>
                    <button className="primary" type="submit">
                      Ejecutar flujo
                    </button>
                  </form>
                </section>

                <section className="panel compact-panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Configuración visible</p>
                      <h3>Servicios y horario</h3>
                    </div>
                  </div>

                  <div className="service-list">
                    {dashboard.services.map((service) => (
                      <div key={service.id} className="service-card">
                        <strong>{service.name}</strong>
                        <span>{service.durationMinutes} min</span>
                      </div>
                    ))}
                  </div>

                  <div className="availability-grid">
                    {dashboard.availabilityRules.map((rule) => (
                      <div key={rule.id} className="rule-card">
                        <strong>{weekdayLabel[rule.weekday]}</strong>
                        <span>
                          {rule.start} - {rule.end}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </section>

            <section className="bottom-grid">
              <section className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Mensajes recientes</p>
                    <h3>Actividad de WhatsApp</h3>
                  </div>
                </div>

                <div className="message-list">
                  {dashboard.recentMessages.length ? (
                    dashboard.recentMessages.map((message) => (
                      <MessageItem
                        key={message.id}
                        message={message}
                        contactName={contactsById.get(message.contactId)?.name ?? "Paciente"}
                      />
                    ))
                  ) : (
                    <div className="empty-state">Todavía no hay mensajes recientes.</div>
                  )}
                </div>
              </section>

              <section className="panel insight-panel">
                <p className="eyebrow">Resumen operativo</p>
                <div className="insight-list">
                  <div className="insight-card">
                    <strong>Siguiente paso</strong>
                    <span>
                      {dashboard.metrics.pendingConfirmations
                        ? "Hay citas pendientes de confirmar."
                        : "La confirmación manual está al día."}
                    </span>
                  </div>
                  <div className="insight-card">
                    <strong>Automatizaciones</strong>
                    <span>
                      {dashboard.metrics.reviewsPending
                        ? "Hay reseñas pendientes de disparar."
                        : "No hay reseñas esperando envío."}
                    </span>
                  </div>
                  <div className="insight-card">
                    <strong>Canal</strong>
                    <span>{dashboard.channel?.phoneE164 ?? "Configura el número dedicado del negocio."}</span>
                  </div>
                  <div className="insight-card">
                    <strong>Última actividad</strong>
                    <span>
                      {dashboard.recentMessages[0]
                        ? dateTimeLabel(dashboard.recentMessages[0].createdAt)
                        : "Sin actividad reciente"}
                    </span>
                  </div>
                </div>
              </section>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MessageItem({ message, contactName }: { message: MessageLog; contactName: string }) {
  return (
    <article className={`message-item ${message.direction}`}>
      <div className="message-main">
        <strong>{contactName}</strong>
        <p>{message.body}</p>
      </div>
      <span className="message-time">{dateTimeLabel(message.createdAt)}</span>
    </article>
  );
}

export default App;
