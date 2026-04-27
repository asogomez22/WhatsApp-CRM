import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  Appointment,
  AppointmentStatus,
  AuthSession,
  BillingStatus,
  Business,
  DashboardSummary,
  MessageLog,
  PlanCode,
  SessionUser
} from "./types";

const today = new Date().toISOString().slice(0, 10);
const weekdayLabel = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const calendarHours = Array.from({ length: 12 }, (_, index) => index + 8);
const viewTabs = [
  { id: "overview", label: "Overview", icon: "space_dashboard" },
  { id: "agenda", label: "Calendar", icon: "calendar_month" },
  { id: "inbox", label: "Inbox", icon: "chat" },
  { id: "setup", label: "Automation", icon: "auto_awesome" }
] as const;

type ViewId = (typeof viewTabs)[number]["id"];

const viewMeta: Record<
  ViewId,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  overview: {
    eyebrow: "Dashboard operativo",
    title: "Vista general",
    description: "Salud del negocio, onboarding, actividad y automatizaciones visibles en una sola capa operativa."
  },
  agenda: {
    eyebrow: "Calendar",
    title: "Agenda diaria",
    description: "Control de citas, altas manuales y captacion en un layout compacto y de lectura rapida."
  },
  inbox: {
    eyebrow: "Inbox",
    title: "Mensajeria y flujos",
    description: "Actividad reciente, simulacion de WhatsApp y visibilidad del equipo que opera el canal."
  },
  setup: {
    eyebrow: "Automation Settings",
    title: "Configuracion y readiness",
    description: "Canal, resenas, billing, catalogo y disponibilidad presentados con la misma logica de cards del mock."
  }
};

const planLabel: Record<PlanCode, string> = {
  reviews: "Plan 1 · Resenas",
  anti_no_show: "Plan 2 · Anti no-show",
  auto_appointments: "Plan 3 · Citas automaticas",
  full_pack: "Pack completo"
};

const statusLabel: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  scheduled: "Programada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No-show"
};

const billingLabel: Record<BillingStatus, string> = {
  unconfigured: "Sin configurar",
  trial: "Trial",
  active: "Activo",
  past_due: "Pendiente"
};

const defaultBusinessForm = {
  name: "",
  email: "",
  phone: "",
  city: "",
  address: "",
  timezone: "Europe/Madrid",
  notes: "",
  plan: "full_pack" as PlanCode,
  googleReviewLink: "",
  billingStatus: "unconfigured" as BillingStatus
};

const defaultChannelForm = {
  phoneE164: "",
  phoneNumberId: "",
  wabaId: "",
  accessTokenEncrypted: "",
  verifyToken: "",
  displayName: "",
  templateNames: "",
  templatesReady: false,
  metaVerified: false,
  active: true
};

const defaultAvailabilityRule = {
  weekday: 1,
  start: "09:00",
  end: "14:00"
};

const moneyLabel = (amount: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount);

const timeLabel = (iso: string, timezone = "Europe/Madrid") =>
  new Intl.DateTimeFormat("es-ES", {
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(iso));

const dateTimeLabel = (iso: string, timezone = "Europe/Madrid") =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(iso));

const dateLabel = (isoDate: string) =>
  new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${isoDate}T00:00:00.000Z`));

const getCalendarPosition = (appointment: Appointment) => {
  const start = new Date(appointment.startAt);
  const end = new Date(appointment.endAt);
  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();
  const calendarStart = 8 * 60;
  const calendarEnd = 20 * 60;
  const totalMinutes = calendarEnd - calendarStart;
  const top = Math.max(0, ((startMinutes - calendarStart) / totalMinutes) * 100);
  const height = Math.max(7, ((Math.min(endMinutes, calendarEnd) - Math.max(startMinutes, calendarStart)) / totalMinutes) * 100);

  return {
    top: `${top}%`,
    height: `${height}%`
  };
};

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function App() {
  const [session, setSession] = useState<{ user: SessionUser; businesses: Business[] } | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [view, setView] = useState<ViewId>("overview");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [businessForm, setBusinessForm] = useState(defaultBusinessForm);
  const [channelForm, setChannelForm] = useState(defaultChannelForm);
  const [newBusinessForm, setNewBusinessForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    plan: "reviews" as PlanCode,
    googleReviewLink: "https://g.page/r/demo-review-link"
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    tags: "lead, nuevo"
  });
  const [serviceForm, setServiceForm] = useState({
    name: "",
    durationMinutes: 30
  });
  const [appointmentForm, setAppointmentForm] = useState({
    contactId: "",
    serviceId: "",
    startAtLocal: "",
    notes: ""
  });
  const [simulateForm, setSimulateForm] = useState({
    fromPhone: "+34655566777",
    text: "Quiero cita"
  });
  const [availabilityDraft, setAvailabilityDraft] = useState<Array<{ weekday: number; start: string; end: string }>>([
    defaultAvailabilityRule
  ]);

  const applySession = (nextSession: AuthSession) => {
    api.setToken(nextSession.token);
    setSession({
      user: nextSession.user,
      businesses: nextSession.businesses
    });
    setSelectedBusinessId(nextSession.businesses[0]?.id || "");
    setDashboard(null);
    setPageError(null);
    setNotice(null);
  };

  useEffect(() => {
    let cancelled = false;

    const loadApp = async () => {
      setAppLoading(true);
      try {
        let currentSession:
          | {
              user: SessionUser;
              businesses: Business[];
            }
          | AuthSession;

        if (api.getToken()) {
          try {
            currentSession = await api.getSession();
          } catch {
            api.setToken("");
            currentSession = await api.autoLogin();
          }
        } else {
          currentSession = await api.autoLogin();
        }

        if (cancelled) {
          return;
        }

        applySession({
          token: "token" in currentSession ? currentSession.token : api.getToken(),
          user: currentSession.user,
          businesses: currentSession.businesses
        });
      } catch (error) {
        api.setToken("");
        if (!cancelled) {
          setSession(null);
          setPageError(error instanceof Error ? error.message : "No se pudo abrir el dashboard");
        }
      } finally {
        if (!cancelled) {
          setAppLoading(false);
        }
      }
    };

    void loadApp();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.businesses.length) {
      return;
    }

    if (!selectedBusinessId || !session.businesses.some((business) => business.id === selectedBusinessId)) {
      setSelectedBusinessId(session.businesses[0].id);
    }
  }, [selectedBusinessId, session]);

  const refreshBusinesses = async (preferredBusinessId?: string) => {
    if (!session) {
      return;
    }

    const businesses = await api.getBusinesses();
    setSession((current) => (current ? { ...current, businesses } : current));
    if (preferredBusinessId) {
      setSelectedBusinessId(preferredBusinessId);
      return;
    }

    if (!businesses.some((business) => business.id === selectedBusinessId)) {
      setSelectedBusinessId(businesses[0]?.id ?? "");
    }
  };

  const refreshDashboard = async (businessId = selectedBusinessId, selectedDate = date) => {
    if (!businessId) {
      return;
    }

    setLoadingDashboard(true);
    setPageError(null);

    try {
      const nextDashboard = await api.getDashboard(businessId, selectedDate);
      startTransition(() => {
        setDashboard(nextDashboard);
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No se pudo cargar el dashboard");
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (!selectedBusinessId || !session) {
      return;
    }

    void refreshDashboard(selectedBusinessId, date);
  }, [date, selectedBusinessId, session]);

  useEffect(() => {
    if (!dashboard) {
      return;
    }

    setBusinessForm({
      name: dashboard.business.name,
      email: dashboard.business.email,
      phone: dashboard.business.phone,
      city: dashboard.business.city,
      address: dashboard.business.address || "",
      timezone: dashboard.business.timezone,
      notes: dashboard.business.notes || "",
      plan: dashboard.business.plan,
      googleReviewLink: dashboard.business.googleReviewLink,
      billingStatus: dashboard.business.billingStatus
    });

    setChannelForm({
      phoneE164: dashboard.channel?.phoneE164 || "",
      phoneNumberId: dashboard.channel?.phoneNumberId || "",
      wabaId: dashboard.channel?.wabaId || "",
      accessTokenEncrypted: dashboard.channel?.accessTokenEncrypted || "",
      verifyToken: dashboard.channel?.verifyToken || "",
      displayName: dashboard.channel?.displayName || dashboard.business.name,
      templateNames: dashboard.channel?.templateNames.join(", ") || "",
      templatesReady: dashboard.channel?.templatesReady || false,
      metaVerified: dashboard.channel?.metaVerified || false,
      active: dashboard.channel?.active ?? true
    });

    setAvailabilityDraft(
      dashboard.availabilityRules.length
        ? dashboard.availabilityRules.map((rule) => ({
            weekday: rule.weekday,
            start: rule.start,
            end: rule.end
          }))
        : [defaultAvailabilityRule]
    );

    setAppointmentForm((current) => ({
      ...current,
      contactId: dashboard.contacts.some((contact) => contact.id === current.contactId)
        ? current.contactId
        : dashboard.contacts[0]?.id || "",
      serviceId: dashboard.services.some((service) => service.id === current.serviceId)
        ? current.serviceId
        : dashboard.services[0]?.id || ""
    }));
  }, [dashboard]);

  const selectedBusiness = useMemo(
    () => session?.businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [selectedBusinessId, session?.businesses]
  );
  const activeView = viewMeta[view];

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

  const performAction = async (task: () => Promise<void>, successMessage?: string) => {
    setPageError(null);
    setNotice(null);

    try {
      await task();
      if (successMessage) {
        setNotice(successMessage);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No se pudo completar la accion");
    }
  };

  const submitAppointment = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard || !appointmentForm.startAtLocal) {
      return;
    }

    const service = dashboard.services.find((item) => item.id === appointmentForm.serviceId);
    if (!service) {
      setPageError("Selecciona un servicio valido");
      return;
    }

    const startAt = new Date(appointmentForm.startAtLocal).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + service.durationMinutes * 60 * 1000).toISOString();

    await performAction(async () => {
      await api.createAppointment(dashboard.business.id, {
        contactId: appointmentForm.contactId,
        serviceId: appointmentForm.serviceId,
        startAt,
        endAt,
        status: "scheduled",
        source: "manual",
        notes: appointmentForm.notes || undefined
      });
      setAppointmentForm((current) => ({ ...current, startAtLocal: "", notes: "" }));
      await refreshDashboard(dashboard.business.id, date);
    }, "Cita creada");
  };

  const updateStatus = async (appointmentId: string, status: AppointmentStatus) => {
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.updateAppointment(dashboard.business.id, appointmentId, { status });
      await refreshDashboard(dashboard.business.id, date);
    }, "Estado actualizado");
  };

  const runAutomations = async () => {
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.processAutomations(dashboard.business.id);
      await refreshDashboard(dashboard.business.id, date);
    }, "Automatizaciones procesadas");
  };

  const simulateMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.simulateIncomingMessage(dashboard.business.id, simulateForm);
      await refreshDashboard(dashboard.business.id, date);
    }, "Flujo de WhatsApp ejecutado");
  };

  const saveBusinessSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.updateBusiness(dashboard.business.id, businessForm);
      await refreshBusinesses(dashboard.business.id);
      await refreshDashboard(dashboard.business.id, date);
    }, "Perfil del negocio actualizado");
  };

  const saveChannelSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.saveWhatsappChannel(dashboard.business.id, {
        phoneE164: channelForm.phoneE164,
        phoneNumberId: channelForm.phoneNumberId,
        wabaId: channelForm.wabaId,
        accessTokenEncrypted: channelForm.accessTokenEncrypted,
        verifyToken: channelForm.verifyToken,
        displayName: channelForm.displayName,
        templateNames: normalizeTags(channelForm.templateNames),
        templatesReady: channelForm.templatesReady,
        metaVerified: channelForm.metaVerified,
        active: channelForm.active
      });
      await refreshDashboard(dashboard.business.id, date);
    }, "Canal de WhatsApp guardado");
  };

  const addService = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.createService(dashboard.business.id, {
        name: serviceForm.name,
        durationMinutes: Number(serviceForm.durationMinutes),
        active: true
      });
      setServiceForm({
        name: "",
        durationMinutes: 30
      });
      await refreshDashboard(dashboard.business.id, date);
    }, "Servicio anadido");
  };

  const addContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.createContact(dashboard.business.id, {
        name: contactForm.name,
        phone: contactForm.phone,
        email: contactForm.email || undefined,
        notes: contactForm.notes || undefined,
        tags: normalizeTags(contactForm.tags)
      });
      setContactForm({
        name: "",
        phone: "",
        email: "",
        notes: "",
        tags: "lead, nuevo"
      });
      await refreshDashboard(dashboard.business.id, date);
    }, "Contacto creado");
  };

  const saveAvailability = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.saveAvailability(
        dashboard.business.id,
        availabilityDraft
          .filter((rule) => rule.start && rule.end)
          .map((rule) => ({
            weekday: Number(rule.weekday),
            start: rule.start,
            end: rule.end
          }))
      );
      await refreshDashboard(dashboard.business.id, date);
    }, "Disponibilidad actualizada");
  };

  const createBusiness = async (event: FormEvent) => {
    event.preventDefault();

    await performAction(async () => {
      const business = await api.createBusiness({
        ...newBusinessForm,
        timezone: "Europe/Madrid",
        notes: "",
        active: true,
        billingStatus: "unconfigured"
      });
      setNewBusinessForm({
        name: "",
        email: "",
        phone: "",
        city: "",
        address: "",
        plan: "reviews",
        googleReviewLink: "https://g.page/r/demo-review-link"
      });
      await refreshBusinesses(business.id);
      await refreshDashboard(business.id, date);
      setView("setup");
    }, "Nuevo negocio creado");
  };

  const openBillingLink = async (mode: "checkout" | "portal") => {
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      const link =
        mode === "checkout"
          ? await api.createCheckoutLink(dashboard.business.id)
          : await api.createPortalLink(dashboard.business.id);

      window.open(link.url, "_blank", "noopener,noreferrer");
    });
  };

  if (appLoading) {
    return (
      <div className="state-shell">
        <div className="state-card">Preparando CRM, agenda y automatizaciones...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="state-shell">
        <section className="state-card state-panel">
          <div className="state-copy">
            <p className="eyebrow">TarracoWebs · WhatsApp CRM</p>
            <h1>Acceso directo al dashboard.</h1>
            <p className="muted">
              El acceso se abre automaticamente sin formulario de login. Si la sesion automatica falla, puedes
              reintentar desde aqui.
            </p>
          </div>

          <div className="state-actions">
            {pageError && <div className="error-banner">{pageError}</div>}
            <button className="primary" type="button" onClick={() => window.location.reload()}>
              Reintentar acceso
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="crm-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">{selectedBusiness?.name?.slice(0, 1) || "T"}</div>
          <div>
            <h2>{selectedBusiness?.name || "TarracoWebs CRM"}</h2>
            <p>Admin Dashboard</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? "sidebar-link active" : "sidebar-link"}
              type="button"
              onClick={() => setView(tab.id)}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-note-card">
            <span className="eyebrow">Canal activo</span>
            <strong>{dashboard?.channel?.phoneE164 || "Pendiente"}</strong>
            <span className="muted">
              {dashboard?.channel?.templatesReady ? "Plantillas listas" : "Plantillas pendientes"}
            </span>
          </div>
          <div className="sidebar-note-card">
            <span className="eyebrow">Sesion</span>
            <strong>{session.user.name}</strong>
            <span className="muted">{session.user.email}</span>
          </div>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="topbar-title">SchedulerPro</div>
        <div className="topbar-actions">
          <label className="field topbar-field">
            <span>Negocio</span>
            <select value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)}>
              {session.businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field topbar-field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <div className="avatar-chip">{session.user.name.slice(0, 1)}</div>
        </div>
      </header>

      <main className="app-main">
        <section className="page-header">
          <div>
            <p className="eyebrow">{activeView.eyebrow}</p>
            <h1>{activeView.title}</h1>
            <p className="page-description">{activeView.description}</p>
          </div>
          <div className="page-meta">
            <span>{selectedBusiness ? planLabel[selectedBusiness.plan] : "Sin plan"}</span>
            <span>{selectedBusiness ? moneyLabel(selectedBusiness.planPriceMonthly) : "--"}</span>
            <span>{dashboard ? billingLabel[dashboard.billing.status] : "Cargando"}</span>
          </div>
        </section>

        {pageError && <div className="error-banner">{pageError}</div>}
        {notice && <div className="notice-banner">{notice}</div>}

        {loadingDashboard || !dashboard ? (
          <div className="state-card">Cargando datos del negocio...</div>
        ) : (
          <>
            {view === "overview" && (
              <>
                <section className="metrics-grid">
                  <MetricCard
                    label="Citas hoy"
                    value={String(dashboard.metrics.todayAppointments)}
                    description="Agenda filtrada por fecha"
                    icon="calendar_month"
                  />
                  <MetricCard
                    label="Pendientes"
                    value={String(dashboard.metrics.pendingConfirmations)}
                    description="Confirmaciones abiertas"
                    icon="schedule"
                  />
                  <MetricCard
                    label="Leads"
                    value={String(dashboard.metrics.leadsTracked)}
                    description="Contactos detectados"
                    icon="groups"
                  />
                  <MetricCard
                    label="Confirmacion"
                    value={`${dashboard.metrics.confirmedRate}%`}
                    description="Ratio historico"
                    icon="verified"
                  />
                </section>

                <section className="dashboard-grid">
                  <section className="surface-card dashboard-span-8">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Agenda inmediata</p>
                        <h3>Proxima actividad</h3>
                      </div>
                      <span className="muted">{dashboard.appointments.length} citas en el dia</span>
                    </div>

                    <div className="highlight-callout">
                      <div>
                        <strong>
                          {nextAppointment ? timeLabel(nextAppointment.startAt, dashboard.business.timezone) : "Sin huecos activos"}
                        </strong>
                        <p className="muted">
                          {nextAppointment
                            ? `${contactsById.get(nextAppointment.contactId)?.name || "Paciente"} · ${
                                servicesById.get(nextAppointment.serviceId)?.name || "Servicio"
                              }`
                            : "La agenda de hoy esta despejada"}
                        </p>
                      </div>
                      <button className="secondary" type="button" onClick={() => setView("agenda")}>
                        Abrir agenda
                      </button>
                    </div>

                    <div className="stack-list">
                      {dashboard.appointments.slice(0, 5).map((appointment) => (
                        <AppointmentRow
                          key={appointment.id}
                          appointment={appointment}
                          contactName={contactsById.get(appointment.contactId)?.name || "Paciente"}
                          serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
                          timezone={dashboard.business.timezone}
                          onStatusChange={updateStatus}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-4">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Checklist</p>
                        <h3>Onboarding operativo</h3>
                      </div>
                      <span className="muted">{dashboard.onboarding.completionRatio}% listo</span>
                    </div>

                    <div className="checklist-list">
                      {dashboard.onboarding.items.map((item) => (
                        <ChecklistRow key={item.id} item={item} />
                      ))}
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-6">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Canal</p>
                        <h3>Readiness del producto</h3>
                      </div>
                    </div>

                    <div className="signal-grid">
                      <SignalCard
                        label="Resenas"
                        status={dashboard.automation.reviewsReady}
                        detail={dashboard.business.googleReviewLink ? "Link y canal listos" : "Falta enlace o canal"}
                      />
                      <SignalCard
                        label="Anti no-show"
                        status={dashboard.automation.remindersReady}
                        detail={dashboard.availabilityRules.length ? "Disponibilidad cargada" : "Carga reglas de agenda"}
                      />
                      <SignalCard
                        label="Citas auto"
                        status={dashboard.automation.autoBookingReady}
                        detail={dashboard.services.length ? "Servicios disponibles" : "Faltan servicios"}
                      />
                      <SignalCard
                        label="Handoff"
                        status={dashboard.automation.handoffReady}
                        detail={dashboard.users.length ? "Equipo asignado" : "Sin usuarios del negocio"}
                      />
                    </div>

                    <div className="info-band">
                      <span>WhatsApp: {dashboard.channel?.phoneE164 || "Pendiente"}</span>
                      <span>Plantillas: {dashboard.channel?.templatesReady ? "Listas" : "Pendientes"}</span>
                      <span>Meta verificado: {dashboard.channel?.metaVerified ? "Si" : "No"}</span>
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-6">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Mensajes</p>
                        <h3>Actividad reciente</h3>
                      </div>
                      <button className="ghost-button" type="button" onClick={() => setView("inbox")}>
                        Abrir inbox
                      </button>
                    </div>

                    <div className="message-stack">
                      {dashboard.recentMessages.slice(0, 6).map((message) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          contactName={contactsById.get(message.contactId)?.name || "Paciente"}
                          timezone={dashboard.business.timezone}
                        />
                      ))}
                    </div>
                  </section>
                </section>
              </>
            )}

            {view === "agenda" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-8">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Agenda del dia</p>
                      <h3>{dateLabel(date)}</h3>
                    </div>
                    <span className="muted">
                      {dashboard.metrics.completedAppointments} completadas · {dashboard.metrics.noShows} no-show
                    </span>
                  </div>

                  <CalendarDay
                    appointments={dashboard.appointments}
                    contactsById={contactsById}
                    servicesById={servicesById}
                    timezone={dashboard.business.timezone}
                    onStatusChange={updateStatus}
                  />
                </section>

                <div className="dashboard-span-4 side-stack">
                  <section className="surface-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Alta rapida</p>
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
                            setAppointmentForm((current) => ({ ...current, startAtLocal: event.target.value }))
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Notas</span>
                        <textarea
                          value={appointmentForm.notes}
                          onChange={(event) =>
                            setAppointmentForm((current) => ({ ...current, notes: event.target.value }))
                          }
                        />
                      </label>

                      <button className="primary" type="submit">
                        Guardar cita
                      </button>
                    </form>
                  </section>

                  <section className="surface-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Captacion</p>
                        <h3>Nuevo contacto</h3>
                      </div>
                    </div>

                    <form className="form-grid" onSubmit={addContact}>
                      <label className="field">
                        <span>Nombre</span>
                        <input
                          value={contactForm.name}
                          onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Telefono</span>
                        <input
                          value={contactForm.phone}
                          onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input
                          value={contactForm.email}
                          onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Tags</span>
                        <input
                          value={contactForm.tags}
                          onChange={(event) => setContactForm((current) => ({ ...current, tags: event.target.value }))}
                        />
                      </label>
                      <button className="secondary" type="submit">
                        Guardar contacto
                      </button>
                    </form>
                  </section>

                  <section className="surface-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Resumen</p>
                        <h3>Estado del dia</h3>
                      </div>
                    </div>
                    <div className="mini-stats agenda-mini-stats">
                      <MiniStat label="Citas" value={String(dashboard.metrics.todayAppointments)} />
                      <MiniStat label="Confirmar" value={String(dashboard.metrics.pendingConfirmations)} />
                      <MiniStat label="Completadas" value={String(dashboard.metrics.completedAppointments)} />
                    </div>
                  </section>
                </div>
              </section>
            )}

            {view === "inbox" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-8">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Inbox de WhatsApp</p>
                      <h3>Actividad y simulacion</h3>
                    </div>
                  </div>

                  <form className="simulate-grid" onSubmit={simulateMessage}>
                    <label className="field">
                      <span>Telefono</span>
                      <input
                        value={simulateForm.fromPhone}
                        onChange={(event) =>
                          setSimulateForm((current) => ({ ...current, fromPhone: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field simulate-wide">
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

                  <div className="message-stack">
                    {dashboard.recentMessages.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        contactName={contactsById.get(message.contactId)?.name || "Paciente"}
                        timezone={dashboard.business.timezone}
                      />
                    ))}
                  </div>
                </section>

                <div className="dashboard-span-4 side-stack">
                  <section className="surface-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Flujos abiertos</p>
                        <h3>Radar operativo</h3>
                      </div>
                    </div>

                    <div className="mini-stats">
                      <MiniStat label="Flujos abiertos" value={String(dashboard.metrics.whatsappOpenFlows)} />
                      <MiniStat label="Resenas pendientes" value={String(dashboard.metrics.reviewsPending)} />
                      <MiniStat label="Por confirmar" value={String(dashboard.metrics.pendingConfirmations)} />
                    </div>
                  </section>

                  <section className="surface-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Equipo</p>
                        <h3>Usuarios con acceso</h3>
                      </div>
                    </div>

                    <div className="team-list">
                      {dashboard.users.map((user) => (
                        <div key={user.id} className="team-card">
                          <strong>{user.name}</strong>
                          <span>{user.role}</span>
                          <span className="muted">{user.email}</span>
                          <span className="muted">
                            {user.lastLoginAt
                              ? dateTimeLabel(user.lastLoginAt, dashboard.business.timezone)
                              : "Sin login reciente"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </section>
            )}

            {view === "setup" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-6 setting-card">
                  <div className="setting-head">
                    <div className="setting-title">
                      <span className="material-symbols-outlined accent-icon">auto_awesome</span>
                      <div>
                        <h3>WhatsApp Reminders</h3>
                        <p>Canal dedicado, plantillas y verificacion listos para automatizar recordatorios.</p>
                      </div>
                    </div>
                    <StatusToggle
                      label={channelForm.templatesReady ? "Active" : "Inactive"}
                      checked={channelForm.templatesReady}
                      onChange={(checked) => setChannelForm((current) => ({ ...current, templatesReady: checked }))}
                    />
                  </div>

                  <form className="form-grid" onSubmit={saveChannelSettings}>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Display name</span>
                        <input
                          value={channelForm.displayName}
                          onChange={(event) =>
                            setChannelForm((current) => ({ ...current, displayName: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Numero E.164</span>
                        <input
                          value={channelForm.phoneE164}
                          onChange={(event) =>
                            setChannelForm((current) => ({ ...current, phoneE164: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="inline-grid">
                      <label className="field">
                        <span>Phone number ID</span>
                        <input
                          value={channelForm.phoneNumberId}
                          onChange={(event) =>
                            setChannelForm((current) => ({ ...current, phoneNumberId: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>WABA ID</span>
                        <input
                          value={channelForm.wabaId}
                          onChange={(event) => setChannelForm((current) => ({ ...current, wabaId: event.target.value }))}
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Template names</span>
                      <input
                        value={channelForm.templateNames}
                        onChange={(event) =>
                          setChannelForm((current) => ({ ...current, templateNames: event.target.value }))
                        }
                      />
                    </label>

                    <div className="toggle-row">
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={channelForm.templatesReady}
                          onChange={(event) =>
                            setChannelForm((current) => ({ ...current, templatesReady: event.target.checked }))
                          }
                        />
                        <span>Plantillas listas</span>
                      </label>
                      <label className="toggle-item">
                        <input
                          type="checkbox"
                          checked={channelForm.metaVerified}
                          onChange={(event) =>
                            setChannelForm((current) => ({ ...current, metaVerified: event.target.checked }))
                          }
                        />
                        <span>Meta verificado</span>
                      </label>
                    </div>

                    <label className="field">
                      <span>Verify token</span>
                      <input
                        value={channelForm.verifyToken}
                        onChange={(event) =>
                          setChannelForm((current) => ({ ...current, verifyToken: event.target.value }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Token cifrado o referencia</span>
                      <input
                        value={channelForm.accessTokenEncrypted}
                        onChange={(event) =>
                          setChannelForm((current) => ({ ...current, accessTokenEncrypted: event.target.value }))
                        }
                      />
                    </label>

                    <button className="primary" type="submit">
                      Guardar canal
                    </button>
                  </form>
                </section>

                <section className="surface-card dashboard-span-6 setting-card">
                  <div className="setting-head">
                    <div className="setting-title">
                      <span className="material-symbols-outlined accent-icon">auto_awesome</span>
                      <div>
                        <h3>Google Reviews</h3>
                        <p>Resenas, billing y estado comercial visibles en la misma card de automatizacion.</p>
                      </div>
                    </div>
                    <StatusToggle
                      label={dashboard.automation.reviewsReady ? "Active" : "Inactive"}
                      checked={dashboard.automation.reviewsReady}
                      disabled
                    />
                  </div>

                  <form className="form-grid" onSubmit={saveBusinessSettings}>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Plan</span>
                        <select
                          value={businessForm.plan}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, plan: event.target.value as PlanCode }))
                          }
                        >
                          {Object.entries(planLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Billing status</span>
                        <select
                          value={businessForm.billingStatus}
                          onChange={(event) =>
                            setBusinessForm((current) => ({
                              ...current,
                              billingStatus: event.target.value as BillingStatus
                            }))
                          }
                        >
                          {Object.entries(billingLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="field">
                      <span>Google review link</span>
                      <input
                        value={businessForm.googleReviewLink}
                        onChange={(event) =>
                          setBusinessForm((current) => ({ ...current, googleReviewLink: event.target.value }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Notas internas</span>
                      <textarea
                        value={businessForm.notes}
                        onChange={(event) => setBusinessForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                    </label>

                    <div className="button-row">
                      <button className="secondary" type="button" onClick={() => void openBillingLink("checkout")}>
                        Checkout Stripe
                      </button>
                      <button className="primary" type="submit">
                        Guardar negocio
                      </button>
                    </div>
                  </form>
                </section>

                <section className="surface-card dashboard-span-8">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Negocio</p>
                      <h3>Perfil, plan y billing</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={saveBusinessSettings}>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Nombre</span>
                        <input
                          value={businessForm.name}
                          onChange={(event) => setBusinessForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input
                          value={businessForm.email}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, email: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="inline-grid">
                      <label className="field">
                        <span>Telefono</span>
                        <input
                          value={businessForm.phone}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, phone: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Ciudad</span>
                        <input
                          value={businessForm.city}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, city: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="inline-grid">
                      <label className="field">
                        <span>Direccion</span>
                        <input
                          value={businessForm.address}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, address: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Timezone</span>
                        <input
                          value={businessForm.timezone}
                          onChange={(event) =>
                            setBusinessForm((current) => ({ ...current, timezone: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <button className="primary" type="submit">
                      Guardar perfil
                    </button>
                  </form>
                </section>

                <section className="surface-card dashboard-span-4">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Catalogo</p>
                      <h3>Servicios</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={addService}>
                    <label className="field">
                      <span>Nombre del servicio</span>
                      <input
                        value={serviceForm.name}
                        onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Duracion</span>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={serviceForm.durationMinutes}
                        onChange={(event) =>
                          setServiceForm((current) => ({
                            ...current,
                            durationMinutes: Number(event.target.value)
                          }))
                        }
                      />
                    </label>
                    <button className="secondary" type="submit">
                      Anadir servicio
                    </button>
                  </form>

                  <div className="service-catalog">
                    {dashboard.services.map((service) => (
                      <div key={service.id} className="service-pill">
                        <strong>{service.name}</strong>
                        <span>{service.durationMinutes} min</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="surface-card dashboard-span-8">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Disponibilidad</p>
                      <h3>Huecos editables</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={saveAvailability}>
                    <div className="availability-editor">
                      {availabilityDraft.map((rule, index) => (
                        <div key={`${rule.weekday}-${index}`} className="availability-row">
                          <select
                            value={rule.weekday}
                            onChange={(event) =>
                              setAvailabilityDraft((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item
                                )
                              )
                            }
                          >
                            {weekdayLabel.map((label, weekday) => (
                              <option key={label} value={weekday}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={rule.start}
                            onChange={(event) =>
                              setAvailabilityDraft((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, start: event.target.value } : item
                                )
                              )
                            }
                          />
                          <input
                            type="time"
                            value={rule.end}
                            onChange={(event) =>
                              setAvailabilityDraft((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, end: event.target.value } : item
                                )
                              )
                            }
                          />
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() =>
                              setAvailabilityDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="button-row">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          setAvailabilityDraft((current) => [
                            ...current,
                            {
                              ...defaultAvailabilityRule
                            }
                          ])
                        }
                      >
                        Anadir franja
                      </button>
                      <button className="primary" type="submit">
                        Guardar disponibilidad
                      </button>
                    </div>
                  </form>
                </section>

                <section className="surface-card dashboard-span-4">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Expansion</p>
                      <h3>Alta de otro negocio</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={createBusiness}>
                    <label className="field">
                      <span>Nombre</span>
                      <input
                        value={newBusinessForm.name}
                        onChange={(event) => setNewBusinessForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        value={newBusinessForm.email}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, email: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Telefono</span>
                      <input
                        value={newBusinessForm.phone}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Ciudad</span>
                      <input
                        value={newBusinessForm.city}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, city: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Direccion</span>
                      <input
                        value={newBusinessForm.address}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, address: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Plan</span>
                      <select
                        value={newBusinessForm.plan}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, plan: event.target.value as PlanCode }))
                        }
                      >
                        {Object.entries(planLabel).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Review link</span>
                      <input
                        value={newBusinessForm.googleReviewLink}
                        onChange={(event) =>
                          setNewBusinessForm((current) => ({ ...current, googleReviewLink: event.target.value }))
                        }
                      />
                    </label>
                    <button className="primary" type="submit">
                      Crear negocio
                    </button>
                  </form>
                </section>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon
}: {
  label: string;
  value: string;
  description: string;
  icon: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-card-head">
        <span>{label}</span>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}

function CalendarDay({
  appointments,
  contactsById,
  servicesById,
  timezone,
  onStatusChange
}: {
  appointments: Appointment[];
  contactsById: Map<string, DashboardSummary["contacts"][number]>;
  servicesById: Map<string, DashboardSummary["services"][number]>;
  timezone: string;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
}) {
  return (
    <div className="calendar-section">
      <div className="calendar-day">
        <div className="calendar-time-axis">
          {calendarHours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="calendar-track">
          {calendarHours.map((hour) => (
            <div key={hour} className="calendar-hour-line" />
          ))}
          {appointments.map((appointment) => (
            <article key={appointment.id} className={`calendar-event ${appointment.status}`} style={getCalendarPosition(appointment)}>
              <strong>{contactsById.get(appointment.contactId)?.name || "Paciente"}</strong>
              <span>
                {timeLabel(appointment.startAt, timezone)} · {servicesById.get(appointment.serviceId)?.name || "Servicio"}
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="calendar-list">
        <div className="section-head compact-head">
          <div>
            <p className="eyebrow">Lista operativa</p>
            <h3>Cambios de estado</h3>
          </div>
        </div>
        <div className="stack-list">
          {appointments.length ? (
            appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                contactName={contactsById.get(appointment.contactId)?.name || "Paciente"}
                serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
                timezone={timezone}
                onStatusChange={onStatusChange}
              />
            ))
          ) : (
            <div className="empty-card">No hay citas para esta fecha.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ item }: { item: DashboardSummary["onboarding"]["items"][number] }) {
  return (
    <div className={`checklist-row ${item.status}`}>
      <div>
        <strong>{item.label}</strong>
        <p>{item.description}</p>
      </div>
      <span>{item.status === "done" ? "Listo" : "Pendiente"}</span>
    </div>
  );
}

function SignalCard({ label, status, detail }: { label: string; status: boolean; detail: string }) {
  return (
    <div className={`signal-card ${status ? "good" : "warn"}`}>
      <div className="signal-head">
        <strong>{label}</strong>
        <span className="material-symbols-outlined accent-icon">auto_awesome</span>
      </div>
      <span>{status ? "Ready" : "Revisar"}</span>
      <p>{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusToggle({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="status-toggle">
      <span>{label}</span>
      <button
        className={checked ? "toggle-switch on" : "toggle-switch"}
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function MessageRow({
  message,
  contactName,
  timezone
}: {
  message: MessageLog;
  contactName: string;
  timezone: string;
}) {
  return (
    <article className={`message-row ${message.direction}`}>
      <div className="message-copy">
        <strong>{contactName}</strong>
        <p>{message.body}</p>
      </div>
      <span>{dateTimeLabel(message.createdAt, timezone)}</span>
    </article>
  );
}

function AppointmentRow({
  appointment,
  contactName,
  serviceName,
  timezone,
  onStatusChange
}: {
  appointment: Appointment;
  contactName: string;
  serviceName: string;
  timezone: string;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
}) {
  return (
    <article className="appointment-row">
      <div className="appointment-time">
        <strong>{timeLabel(appointment.startAt, timezone)}</strong>
        <span className={`status-badge ${appointment.status}`}>{statusLabel[appointment.status]}</span>
      </div>
      <div className="appointment-main">
        <strong>{contactName}</strong>
        <p>
          {serviceName} · {appointment.source === "whatsapp" ? "WhatsApp" : "Manual"}
        </p>
        {appointment.notes && <span className="muted">{appointment.notes}</span>}
      </div>
      <div className="appointment-actions">
        <button type="button" onClick={() => void onStatusChange(appointment.id, "confirmed")}>
          Confirmar
        </button>
        <button type="button" onClick={() => void onStatusChange(appointment.id, "completed")}>
          Completar
        </button>
        <button type="button" onClick={() => void onStatusChange(appointment.id, "cancelled")}>
          Cancelar
        </button>
      </div>
    </article>
  );
}

export default App;
