import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Appointment, DashboardSummary, MessageLog, Service } from "./types";

const today = new Date().toISOString().slice(0, 10);

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(iso));

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
    startAt: "",
    endAt: ""
  });
  const [simulateForm, setSimulateForm] = useState({
    fromPhone: "+34655566777",
    text: "Quiero cita"
  });
  const [calendarForm, setCalendarForm] = useState({
    googleCalendarConnected: false,
    googleCalendarId: "primary"
  });

  useEffect(() => {
    api
      .getBusinesses()
      .then((businesses) => {
        if (businesses[0]) {
          setBusinessId(businesses[0].id);
          setCalendarForm({
            googleCalendarConnected: businesses[0].googleCalendarConnected,
            googleCalendarId: businesses[0].googleCalendarId ?? "primary"
          });
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
      setCalendarForm({
        googleCalendarConnected: data.business.googleCalendarConnected,
        googleCalendarId: data.business.googleCalendarId ?? "primary"
      });
      setAppointmentForm((current) => ({
        ...current,
        contactId: data.contacts[0]?.id ?? "",
        serviceId: data.services[0]?.id ?? ""
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el dashboard");
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
    if (!dashboard) {
      return;
    }

    const endAt = fillEndAt(appointmentForm.serviceId, appointmentForm.startAt);
    await api.createAppointment(dashboard.business.id, {
      ...appointmentForm,
      endAt,
      status: "scheduled",
      source: "manual"
    });
    await loadDashboard(dashboard.business.id, date);
  };

  const updateStatus = async (appointmentId: string, status: Appointment["status"]) => {
    if (!dashboard) {
      return;
    }
    await api.updateAppointment(dashboard.business.id, appointmentId, { status });
    await loadDashboard(dashboard.business.id, date);
  };

  const runAutomations = async () => {
    if (!dashboard) {
      return;
    }
    await api.processAutomations(dashboard.business.id);
    await loadDashboard(dashboard.business.id, date);
  };

  const simulateMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }
    await api.simulateIncomingMessage(dashboard.business.id, simulateForm);
    await loadDashboard(dashboard.business.id, date);
  };

  const saveCalendar = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }
    await api.updateGoogleCalendar(dashboard.business.id, calendarForm);
    await loadDashboard(dashboard.business.id, date);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">TarracoWebs</p>
          <h1>WhatsApp CRM</h1>
          <p className="muted">
            Agenda diaria, reseñas automáticas, anti no-show y captación de citas por WhatsApp.
          </p>
        </div>

        {dashboard && (
          <div className="panel tinted">
            <div className="stack-sm">
              <p className="eyebrow">Canal dedicado</p>
              <strong>{dashboard.channel?.displayName ?? "Sin canal"}</strong>
              <span className="muted">{dashboard.channel?.phoneE164 ?? "Pendiente de alta"}</span>
            </div>
            <div className="pill-row">
              <span className="pill">{dashboard.business.plan}</span>
              <span className="pill">{dashboard.business.city}</span>
            </div>
          </div>
        )}

        <div className="panel">
          <label className="field">
            <span>Fecha de agenda</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button className="secondary" onClick={runAutomations} type="button">
            Procesar automatizaciones
          </button>
        </div>
      </aside>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}
        {loading || !dashboard ? (
          <div className="loading-card">Cargando panel...</div>
        ) : (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">Negocio piloto</p>
                <h2>{dashboard.business.name}</h2>
                <p className="muted">
                  Canal propio por cliente, agenda compartida para los tres módulos y lista para integrarse con Google
                  Calendar.
                </p>
              </div>
              <div className="hero-actions">
                <button className="primary" type="button" onClick={() => setBusinessId(dashboard.business.id)}>
                  Panel activo
                </button>
                <span className="muted">{dashboard.business.email}</span>
              </div>
            </section>

            <section className="metrics-grid">
              <MetricCard label="Citas hoy" value={dashboard.metrics.todayAppointments} accent="sunrise" />
              <MetricCard label="Por confirmar" value={dashboard.metrics.pendingConfirmations} accent="ocean" />
              <MetricCard label="Reseñas pendientes" value={dashboard.metrics.reviewsPending} accent="moss" />
              <MetricCard label="Flujos abiertos" value={dashboard.metrics.whatsappOpenFlows} accent="wine" />
            </section>

            <section className="dashboard-grid">
              <div className="panel spacious">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Agenda del día</p>
                    <h3>Operativa clínica</h3>
                  </div>
                  <span className="muted">{dashboard.appointments.length} citas</span>
                </div>

                <div className="agenda-list">
                  {dashboard.appointments.map((appointment) => (
                    <article key={appointment.id} className="agenda-item">
                      <div>
                        <strong>{contactsById.get(appointment.contactId)?.name ?? "Paciente"}</strong>
                        <p className="muted">{servicesById.get(appointment.serviceId)?.name ?? "Servicio"}</p>
                        <p className="muted">{timeLabel(appointment.startAt)}</p>
                      </div>
                      <div className="agenda-actions">
                        <span className={`status-chip status-${appointment.status}`}>{statusLabel[appointment.status]}</span>
                        <div className="pill-row">
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
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="stack-lg">
                <div className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Alta rápida</p>
                      <h3>Nueva cita manual</h3>
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
                      <span>Inicio</span>
                      <input
                        type="datetime-local"
                        value={appointmentForm.startAt}
                        onChange={(event) =>
                          setAppointmentForm((current) => ({ ...current, startAt: new Date(event.target.value).toISOString() }))
                        }
                      />
                    </label>
                    <button className="primary" type="submit">
                      Guardar cita
                    </button>
                  </form>
                </div>

                <div className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">WhatsApp</p>
                      <h3>Simulador de conversación</h3>
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
                      Enviar al flujo
                    </button>
                  </form>
                </div>

                <div className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Google Calendar</p>
                      <h3>Preparación de integración</h3>
                    </div>
                    <span className={`status-chip ${dashboard.business.googleCalendarConnected ? "status-confirmed" : "status-pending"}`}>
                      {dashboard.business.googleCalendarConnected ? "Conectado" : "Pendiente"}
                    </span>
                  </div>
                  <form className="form-grid" onSubmit={saveCalendar}>
                    <label className="field checkbox">
                      <input
                        type="checkbox"
                        checked={calendarForm.googleCalendarConnected}
                        onChange={(event) =>
                          setCalendarForm((current) => ({
                            ...current,
                            googleCalendarConnected: event.target.checked
                          }))
                        }
                      />
                      <span>Activar sincronización</span>
                    </label>
                    <label className="field">
                      <span>Calendar ID</span>
                      <input
                        value={calendarForm.googleCalendarId}
                        onChange={(event) =>
                          setCalendarForm((current) => ({ ...current, googleCalendarId: event.target.value }))
                        }
                      />
                    </label>
                    <button className="secondary" type="submit">
                      Guardar configuración
                    </button>
                  </form>
                </div>
              </div>
            </section>

            <section className="dashboard-grid">
              <div className="panel spacious">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Mensajería</p>
                    <h3>Últimos mensajes</h3>
                  </div>
                </div>
                <div className="message-list">
                  {dashboard.recentMessages.map((message) => (
                    <MessageItem key={message.id} message={message} contactName={contactsById.get(message.contactId)?.name ?? "Paciente"} />
                  ))}
                </div>
              </div>

              <div className="panel spacious">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Servicios y reglas</p>
                    <h3>MVP acotado</h3>
                  </div>
                </div>
                <div className="service-list">
                  {dashboard.services.map((service) => (
                    <ServiceCard key={service.id} service={service} />
                  ))}
                </div>
                <div className="availability-grid">
                  {dashboard.availabilityRules.map((rule) => (
                    <div key={rule.id} className="rule-card">
                      <strong>Día {rule.weekday}</strong>
                      <span>
                        {rule.start} - {rule.end}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`metric-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MessageItem({ message, contactName }: { message: MessageLog; contactName: string }) {
  return (
    <article className={`message-item ${message.direction}`}>
      <div>
        <strong>{contactName}</strong>
        <p>{message.body}</p>
      </div>
      <span>{timeLabel(message.createdAt)}</span>
    </article>
  );
}

function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="service-card">
      <strong>{service.name}</strong>
      <span>{service.durationMinutes} min</span>
    </article>
  );
}

export default App;
