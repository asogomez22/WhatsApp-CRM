import { FormEvent, ReactNode, startTransition, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  Appointment,
  AppointmentStatus,
  AuthSession,
  BillingStatus,
  Business,
  Contact,
  DashboardSummary,
  MessageLog,
  PlanCode,
  SessionUser
} from "./types";

const today = new Date().toISOString().slice(0, 10);
const weekdayLabel = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const weekdayLabelMondayFirst = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const monthLabel = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const menuItems = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "appointments", label: "Citas", icon: "calendar_month" },
  { id: "clients", label: "Clientes", icon: "groups" },
  { id: "settings", label: "Ajustes", icon: "settings" }
] as const;
const calendarModes = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" }
] as const;
const appointmentStatusesForAgenda: AppointmentStatus[] = ["scheduled", "pending", "confirmed"];

type ViewId = (typeof menuItems)[number]["id"];
type CalendarMode = (typeof calendarModes)[number]["id"];

const viewMeta: Record<ViewId, { title: string; description: string }> = {
  home: {
    title: "Panel general",
    description: "Vision rapida del negocio, la agenda y el ritmo diario del canal."
  },
  appointments: {
    title: "Citas",
    description: "Agenda completa por dia, semana o mes sin salir de la misma vista."
  },
  clients: {
    title: "Clientes",
    description: "Contactos, actividad reciente y altas nuevas con un flujo mas limpio."
  },
  settings: {
    title: "Ajustes",
    description: "Configuracion del negocio, WhatsApp, servicios y disponibilidad."
  }
};

const planLabel: Record<PlanCode, string> = {
  reviews: "Plan Reviews",
  anti_no_show: "Plan Anti no-show",
  auto_appointments: "Plan Auto citas",
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

const defaultContactForm = {
  name: "",
  phone: "",
  email: "",
  notes: "",
  tags: "lead, nuevo"
};

const addDays = (isoDate: string, days: number) => {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const startOfWeek = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
};

const weekDays = (isoDate: string) => {
  const monday = startOfWeek(isoDate);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
};

const monthGrid = (isoDate: string) => {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const endOffset = 6 - ((lastDay.getUTCDay() + 6) % 7);
  const gridStart = new Date(firstDay);
  const gridEnd = new Date(lastDay);

  gridStart.setUTCDate(firstDay.getUTCDate() - startOffset);
  gridEnd.setUTCDate(lastDay.getUTCDate() + endOffset);

  const days: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push({
      iso: cursor.toISOString().slice(0, 10),
      day: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === month
    });
  }

  return {
    label: `${monthLabel[month]} ${year}`,
    days
  };
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

const shortDateLabel = (isoDate: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short"
  }).format(new Date(`${isoDate}T00:00:00.000Z`));

const monthDayLabel = (isoDate: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long"
  }).format(new Date(`${isoDate}T00:00:00.000Z`));

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isSameMonth = (left: string, right: string) => left.slice(0, 7) === right.slice(0, 7);

function App() {
  const [session, setSession] = useState<{ user: SessionUser; businesses: Business[] } | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [view, setView] = useState<ViewId>("home");
  const [date, setDate] = useState(today);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [clientModalOpen, setClientModalOpen] = useState(false);
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
  const [contactForm, setContactForm] = useState(defaultContactForm);
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
    setAllAppointments([]);
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

  const refreshBusinessData = async (businessId = selectedBusinessId) => {
    if (!businessId) {
      return;
    }

    setLoadingDashboard(true);
    setPageError(null);

    try {
      const [nextDashboard, appointments] = await Promise.all([
        api.getDashboard(businessId, today),
        api.getAppointments(businessId)
      ]);

      startTransition(() => {
        setDashboard(nextDashboard);
        setAllAppointments(appointments);
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

    void refreshBusinessData(selectedBusinessId);
  }, [selectedBusinessId, session]);

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

  const contactsById = useMemo(
    () => new Map((dashboard?.contacts ?? []).map((contact) => [contact.id, contact])),
    [dashboard?.contacts]
  );

  const servicesById = useMemo(
    () => new Map((dashboard?.services ?? []).map((service) => [service.id, service])),
    [dashboard?.services]
  );

  const activeView = viewMeta[view];

  const sortedAppointments = useMemo(
    () =>
      [...allAppointments].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime()),
    [allAppointments]
  );

  const selectedWeek = useMemo(() => weekDays(date), [date]);
  const calendar = useMemo(() => monthGrid(date), [date]);

  const dayAppointments = useMemo(
    () => sortedAppointments.filter((appointment) => appointment.startAt.slice(0, 10) === date),
    [date, sortedAppointments]
  );

  const weekAppointments = useMemo(() => {
    const weekSet = new Set(selectedWeek);
    return sortedAppointments.filter((appointment) => weekSet.has(appointment.startAt.slice(0, 10)));
  }, [selectedWeek, sortedAppointments]);

  const monthAppointments = useMemo(
    () => sortedAppointments.filter((appointment) => isSameMonth(appointment.startAt.slice(0, 10), date)),
    [date, sortedAppointments]
  );

  const visibleAppointments = useMemo(() => {
    if (calendarMode === "day") {
      return dayAppointments;
    }

    if (calendarMode === "week") {
      return weekAppointments;
    }

    return monthAppointments;
  }, [calendarMode, dayAppointments, monthAppointments, weekAppointments]);

  const selectedDateContacts = useMemo(() => {
    const ids = new Set(dayAppointments.map((appointment) => appointment.contactId));
    return (dashboard?.contacts ?? []).filter((contact) => ids.has(contact.id));
  }, [dashboard?.contacts, dayAppointments]);

  const nextAppointment = useMemo(
    () => sortedAppointments.find((appointment) => appointmentStatusesForAgenda.includes(appointment.status)),
    [sortedAppointments]
  );

  const metrics = useMemo(() => {
    const source = visibleAppointments;
    return {
      total: source.length,
      pending: source.filter((appointment) => appointment.status === "scheduled" || appointment.status === "pending").length,
      confirmed: source.filter((appointment) => appointment.status === "confirmed").length,
      completed: source.filter((appointment) => appointment.status === "completed").length,
      noShows: source.filter((appointment) => appointment.status === "no_show").length
    };
  }, [visibleAppointments]);

  const monthCellsByDate = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    monthAppointments.forEach((appointment) => {
      const key = appointment.startAt.slice(0, 10);
      const current = grouped.get(key) ?? [];
      current.push(appointment);
      grouped.set(key, current);
    });
    return grouped;
  }, [monthAppointments]);

  const weekColumns = useMemo(
    () =>
      selectedWeek.map((isoDate) => ({
        isoDate,
        appointments: weekAppointments
          .filter((appointment) => appointment.startAt.slice(0, 10) === isoDate)
          .sort((left, right) => left.startAt.localeCompare(right.startAt))
      })),
    [selectedWeek, weekAppointments]
  );

  const appointmentFeed = useMemo(() => {
    if (calendarMode === "day") {
      return dayAppointments;
    }

    if (calendarMode === "week") {
      return weekAppointments;
    }

    return monthAppointments;
  }, [calendarMode, dayAppointments, monthAppointments, weekAppointments]);

  const groupedFeed = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    appointmentFeed.forEach((appointment) => {
      const key = appointment.startAt.slice(0, 10);
      const current = groups.get(key) ?? [];
      current.push(appointment);
      groups.set(key, current);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [appointmentFeed]);

  const dashboardSignals = useMemo(
    () => [
      {
        label: "WhatsApp",
        value: dashboard?.channel?.phoneE164 || "Sin conectar",
        detail: dashboard?.channel?.templatesReady ? "Plantillas listas" : "Plantillas pendientes"
      },
      {
        label: "Facturacion",
        value: dashboard ? billingLabel[dashboard.billing.status] : "Cargando",
        detail: dashboard?.billing.checkoutConfigured ? "Stripe preparado" : "Checkout pendiente"
      },
      {
        label: "Clientes",
        value: String(dashboard?.contacts.length ?? 0),
        detail: `${dashboard?.metrics.leadsTracked ?? 0} leads identificados`
      }
    ],
    [dashboard]
  );

  const periodLabel = useMemo(() => {
    if (calendarMode === "day") {
      return dateLabel(date);
    }

    if (calendarMode === "week") {
      const start = selectedWeek[0];
      const end = selectedWeek[selectedWeek.length - 1];
      return `${shortDateLabel(start)} - ${shortDateLabel(end)}`;
    }

    return calendar.label;
  }, [calendar.label, calendarMode, date, selectedWeek]);

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
      await refreshBusinessData(dashboard.business.id);
    }, "Cita creada");
  };

  const updateStatus = async (appointmentId: string, status: AppointmentStatus) => {
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.updateAppointment(dashboard.business.id, appointmentId, { status });
      await refreshBusinessData(dashboard.business.id);
    }, "Estado actualizado");
  };

  const runAutomations = async () => {
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.processAutomations(dashboard.business.id);
      await refreshBusinessData(dashboard.business.id);
    }, "Automatizaciones procesadas");
  };

  const saveBusinessSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    await performAction(async () => {
      await api.updateBusiness(dashboard.business.id, businessForm);
      await refreshBusinesses(dashboard.business.id);
      await refreshBusinessData(dashboard.business.id);
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
      await refreshBusinessData(dashboard.business.id);
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
      await refreshBusinessData(dashboard.business.id);
    }, "Servicio anadido");
  };

  const submitContact = async (event: FormEvent) => {
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
      setContactForm(defaultContactForm);
      setClientModalOpen(false);
      await refreshBusinessData(dashboard.business.id);
    }, "Cliente creado");
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
      await refreshBusinessData(dashboard.business.id);
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
      await refreshBusinessData(business.id);
      setView("settings");
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

  const moveCalendar = (direction: -1 | 1) => {
    if (calendarMode === "day") {
      setDate((current) => addDays(current, direction));
      return;
    }

    if (calendarMode === "week") {
      setDate((current) => addDays(current, direction * 7));
      return;
    }

    const current = new Date(`${date}T00:00:00.000Z`);
    current.setUTCMonth(current.getUTCMonth() + direction);
    setDate(current.toISOString().slice(0, 10));
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
        <section className="state-card">
          <p className="eyebrow">WhatsApp CRM</p>
          <h1>Acceso no disponible</h1>
          <p className="state-text">{pageError || "No se pudo iniciar la sesion automatica."}</p>
        </section>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">{selectedBusiness?.name?.slice(0, 1) || "W"}</div>
            <div>
              <strong>{selectedBusiness?.name || "WhatsApp CRM"}</strong>
              <p>Gestor operativo</p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "sidebar-link active" : "sidebar-link"}
                type="button"
                onClick={() => setView(item.id)}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="status-dot" />
            <div>
              <span>WhatsApp Web</span>
              <strong>{dashboard?.channel?.active ? "Conectado" : "Pendiente"}</strong>
            </div>
          </div>
        </aside>

        <main className="app-main">
          <header className="topbar">
            <div>
              <p className="eyebrow">{activeView.title}</p>
              <h1>{activeView.title}</h1>
              <p className="page-description">{activeView.description}</p>
            </div>

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
              <button className="topbar-utility" type="button" onClick={() => void runAutomations()}>
                <span className="material-symbols-outlined">sync</span>
              </button>
              <div className="avatar-chip">{session.user.name.slice(0, 2).toUpperCase()}</div>
            </div>
          </header>

          {pageError && <div className="banner error-banner">{pageError}</div>}
          {notice && <div className="banner notice-banner">{notice}</div>}

          {loadingDashboard || !dashboard ? (
            <div className="state-card inline-state">Cargando datos del negocio...</div>
          ) : (
            <>
              {view === "home" && (
                <section className="page-stack">
                  <section className="hero-strip">
                    <OverviewCard label="Citas visibles" value={String(metrics.total)} detail={periodLabel} />
                    <OverviewCard label="Pendientes" value={String(metrics.pending)} detail="Esperando confirmacion" />
                    <OverviewCard label="Confirmadas" value={String(metrics.confirmed)} detail="Operativa lista" />
                    <OverviewCard
                      label="Facturacion"
                      value={billingLabel[dashboard.billing.status]}
                      detail={selectedBusiness ? planLabel[selectedBusiness.plan] : "Sin plan"}
                    />
                  </section>

                  <section className="home-grid">
                    <section className="panel general-panel span-8">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Resumen de hoy</p>
                          <h2>Panel operativo</h2>
                        </div>
                      </div>

                      <div className="general-summary-grid">
                        <article className="feature-card">
                          <span className="feature-label">Siguiente cita</span>
                          <strong>{nextAppointment ? timeLabel(nextAppointment.startAt, dashboard.business.timezone) : "Libre"}</strong>
                          <p>
                            {nextAppointment
                              ? `${contactsById.get(nextAppointment.contactId)?.name || "Cliente"} · ${
                                  servicesById.get(nextAppointment.serviceId)?.name || "Servicio"
                                }`
                              : "No hay una cita inmediata pendiente."}
                          </p>
                        </article>

                        <article className="feature-card emphasis-card">
                          <span className="feature-label">Estado del dia</span>
                          <strong>{dateLabel(date)}</strong>
                          <p>{dayAppointments.length} citas registradas en la fecha seleccionada.</p>
                        </article>

                        {dashboardSignals.map((signal) => (
                          <article key={signal.label} className="mini-feature-card">
                            <span>{signal.label}</span>
                            <strong>{signal.value}</strong>
                            <p>{signal.detail}</p>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="panel compact-feed span-4">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Agenda rapida</p>
                          <h2>Hoy</h2>
                        </div>
                        <span className="count-badge">{dayAppointments.length}</span>
                      </div>

                      <div className="compact-appointments">
                        {dayAppointments.length ? (
                          dayAppointments.slice(0, 5).map((appointment) => (
                            <CompactAppointmentRow
                              key={appointment.id}
                              appointment={appointment}
                              contactName={contactsById.get(appointment.contactId)?.name || "Cliente"}
                              serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
                              timezone={dashboard.business.timezone}
                            />
                          ))
                        ) : (
                          <EmptyState title="Sin citas hoy" detail="La agenda del dia esta despejada." />
                        )}
                      </div>
                    </section>
                  </section>

                  <section className="home-grid">
                    <section className="panel span-8">
                      <CalendarToolbar
                        mode={calendarMode}
                        onModeChange={setCalendarMode}
                        label={periodLabel}
                        onPrev={() => moveCalendar(-1)}
                        onNext={() => moveCalendar(1)}
                        onToday={() => setDate(today)}
                      />

                      {calendarMode === "day" && (
                        <DayBoard
                          appointments={dayAppointments}
                          contactsById={contactsById}
                          servicesById={servicesById}
                          timezone={dashboard.business.timezone}
                          onStatusChange={updateStatus}
                        />
                      )}

                      {calendarMode === "week" && (
                        <WeekBoard
                          weekColumns={weekColumns}
                          contactsById={contactsById}
                          servicesById={servicesById}
                          timezone={dashboard.business.timezone}
                          selectedDate={date}
                          onSelectDate={setDate}
                        />
                      )}

                      {calendarMode === "month" && (
                        <MonthBoard
                          calendar={calendar}
                          selectedDate={date}
                          monthCellsByDate={monthCellsByDate}
                          contactsById={contactsById}
                          timezone={dashboard.business.timezone}
                          onSelectDate={setDate}
                        />
                      )}
                    </section>

                    <section className="panel span-4">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Actividad reciente</p>
                          <h2>Mensajes</h2>
                        </div>
                      </div>

                      <div className="message-list">
                        {dashboard.recentMessages.length ? (
                          dashboard.recentMessages.slice(0, 6).map((message) => (
                            <MessageRow
                              key={message.id}
                              message={message}
                              contactName={contactsById.get(message.contactId)?.name || "Cliente"}
                              timezone={dashboard.business.timezone}
                            />
                          ))
                        ) : (
                          <EmptyState title="Sin actividad" detail="Los mensajes del canal apareceran aqui." />
                        )}
                      </div>
                    </section>
                  </section>
                </section>
              )}

              {view === "appointments" && (
                <section className="page-stack">
                  <section className="appointments-layout">
                    <section className="panel span-8">
                      <CalendarToolbar
                        mode={calendarMode}
                        onModeChange={setCalendarMode}
                        label={periodLabel}
                        onPrev={() => moveCalendar(-1)}
                        onNext={() => moveCalendar(1)}
                        onToday={() => setDate(today)}
                      />

                      {calendarMode === "day" && (
                        <DayBoard
                          appointments={dayAppointments}
                          contactsById={contactsById}
                          servicesById={servicesById}
                          timezone={dashboard.business.timezone}
                          onStatusChange={updateStatus}
                        />
                      )}

                      {calendarMode === "week" && (
                        <WeekBoard
                          weekColumns={weekColumns}
                          contactsById={contactsById}
                          servicesById={servicesById}
                          timezone={dashboard.business.timezone}
                          selectedDate={date}
                          onSelectDate={setDate}
                        />
                      )}

                      {calendarMode === "month" && (
                        <MonthBoard
                          calendar={calendar}
                          selectedDate={date}
                          monthCellsByDate={monthCellsByDate}
                          contactsById={contactsById}
                          timezone={dashboard.business.timezone}
                          onSelectDate={setDate}
                        />
                      )}
                    </section>

                    <section className="panel side-panel span-4">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Nueva cita</p>
                          <h2>Reserva manual</h2>
                        </div>
                      </div>

                      <form className="form-grid" onSubmit={submitAppointment}>
                        <label className="field">
                          <span>Cliente</span>
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
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <p className="eyebrow">Listado</p>
                        <h2>Citas visibles</h2>
                      </div>
                      <span className="count-badge">{appointmentFeed.length}</span>
                    </div>

                    <div className="agenda-group-list">
                      {groupedFeed.length ? (
                        groupedFeed.map(([groupDate, appointments]) => (
                          <section key={groupDate} className="agenda-group">
                            <div className="agenda-group-header">
                              <strong>{dateLabel(groupDate)}</strong>
                              <span>{appointments.length} citas</span>
                            </div>
                            <div className="appointments-list">
                              {appointments.map((appointment) => (
                                <AppointmentCard
                                  key={appointment.id}
                                  appointment={appointment}
                                  contact={contactsById.get(appointment.contactId)}
                                  serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
                                  timezone={dashboard.business.timezone}
                                  onStatusChange={updateStatus}
                                />
                              ))}
                            </div>
                          </section>
                        ))
                      ) : (
                        <EmptyState title="Sin citas en este rango" detail="Prueba con otro periodo o crea una nueva cita." />
                      )}
                    </div>
                  </section>
                </section>
              )}

              {view === "clients" && (
                <section className="page-stack">
                  <section className="clients-layout">
                    <section className="panel span-8">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Base de clientes</p>
                          <h2>Contactos activos</h2>
                        </div>
                        <button className="ghost-button" type="button" onClick={() => setClientModalOpen(true)}>
                          Nuevo cliente
                        </button>
                      </div>

                      <div className="contact-list">
                        {dashboard.contacts.length ? (
                          dashboard.contacts.map((contact) => (
                            <article key={contact.id} className="contact-card">
                              <div className="contact-avatar">{contact.name.slice(0, 2).toUpperCase()}</div>
                              <div className="contact-main">
                                <strong>{contact.name}</strong>
                                <span>{contact.phone}</span>
                                <p>{contact.email || "Sin email"} · {(contact.tags || []).join(", ") || "Sin etiquetas"}</p>
                              </div>
                              <div className="contact-meta">
                                <span>
                                  {contact.lastInteractionAt
                                    ? dateTimeLabel(contact.lastInteractionAt, dashboard.business.timezone)
                                    : "Sin actividad"}
                                </span>
                              </div>
                            </article>
                          ))
                        ) : (
                          <EmptyState title="Todavia no hay clientes" detail="Crea el primer cliente desde el modal." />
                        )}
                      </div>
                    </section>

                    <section className="panel side-panel span-4">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Relacion con el cliente</p>
                          <h2>Actividad reciente</h2>
                        </div>
                      </div>

                      <div className="message-list">
                        {dashboard.recentMessages.length ? (
                          dashboard.recentMessages.map((message) => (
                            <MessageRow
                              key={message.id}
                              message={message}
                              contactName={contactsById.get(message.contactId)?.name || "Cliente"}
                              timezone={dashboard.business.timezone}
                            />
                          ))
                        ) : (
                          <EmptyState title="Sin conversaciones" detail="La actividad de WhatsApp aparecera aqui." />
                        )}
                      </div>

                      <div className="client-insight-grid">
                        <InsightTile label="Clientes con cita hoy" value={String(selectedDateContacts.length)} />
                        <InsightTile label="Leads" value={String(dashboard.metrics.leadsTracked)} />
                        <InsightTile label="Mensajes" value={String(dashboard.recentMessages.length)} />
                      </div>
                    </section>
                  </section>
                </section>
              )}

              {view === "settings" && (
                <section className="page-stack">
                  <section className="settings-grid">
                    <section className="panel span-6">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Perfil</p>
                          <h2>Datos del negocio</h2>
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
                              onChange={(event) => setBusinessForm((current) => ({ ...current, email: event.target.value }))}
                            />
                          </label>
                        </div>

                        <div className="inline-grid">
                          <label className="field">
                            <span>Telefono</span>
                            <input
                              value={businessForm.phone}
                              onChange={(event) => setBusinessForm((current) => ({ ...current, phone: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span>Ciudad</span>
                            <input
                              value={businessForm.city}
                              onChange={(event) => setBusinessForm((current) => ({ ...current, city: event.target.value }))}
                            />
                          </label>
                        </div>

                        <div className="inline-grid">
                          <label className="field">
                            <span>Direccion</span>
                            <input
                              value={businessForm.address}
                              onChange={(event) => setBusinessForm((current) => ({ ...current, address: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span>Timezone</span>
                            <input
                              value={businessForm.timezone}
                              onChange={(event) => setBusinessForm((current) => ({ ...current, timezone: event.target.value }))}
                            />
                          </label>
                        </div>

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
                            <span>Billing</span>
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
                          <button className="ghost-button" type="button" onClick={() => void openBillingLink("portal")}>
                            Portal Stripe
                          </button>
                          <button className="primary" type="submit">
                            Guardar negocio
                          </button>
                        </div>
                      </form>
                    </section>

                    <section className="panel span-6">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Canal</p>
                          <h2>WhatsApp</h2>
                        </div>
                        <StatusToggle
                          label={channelForm.active ? "Activo" : "Inactivo"}
                          checked={channelForm.active}
                          onChange={(checked) => setChannelForm((current) => ({ ...current, active: checked }))}
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

                    <section className="panel span-4">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Servicios</p>
                          <h2>Catalogo</h2>
                        </div>
                      </div>

                      <form className="form-grid" onSubmit={addService}>
                        <label className="field">
                          <span>Nombre</span>
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
                        <button className="ghost-button" type="submit">
                          Anadir servicio
                        </button>
                      </form>

                      <div className="pill-list">
                        {dashboard.services.map((service) => (
                          <div key={service.id} className="service-pill">
                            <strong>{service.name}</strong>
                            <span>{service.durationMinutes} min</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="panel span-8">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Disponibilidad</p>
                          <h2>Franjas horarias</h2>
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

                    <section className="panel span-12">
                      <div className="panel-head">
                        <div>
                          <p className="eyebrow">Expansion</p>
                          <h2>Alta de otro negocio</h2>
                        </div>
                        <button className="ghost-button" type="button" onClick={() => void openBillingLink("checkout")}>
                          Checkout Stripe
                        </button>
                      </div>

                      <form className="form-grid business-grid" onSubmit={createBusiness}>
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
                            onChange={(event) => setNewBusinessForm((current) => ({ ...current, email: event.target.value }))}
                          />
                        </label>
                        <label className="field">
                          <span>Telefono</span>
                          <input
                            value={newBusinessForm.phone}
                            onChange={(event) => setNewBusinessForm((current) => ({ ...current, phone: event.target.value }))}
                          />
                        </label>
                        <label className="field">
                          <span>Ciudad</span>
                          <input
                            value={newBusinessForm.city}
                            onChange={(event) => setNewBusinessForm((current) => ({ ...current, city: event.target.value }))}
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
                        <label className="field span-all">
                          <span>Google review link</span>
                          <input
                            value={newBusinessForm.googleReviewLink}
                            onChange={(event) =>
                              setNewBusinessForm((current) => ({ ...current, googleReviewLink: event.target.value }))
                            }
                          />
                        </label>
                        <button className="primary span-all" type="submit">
                          Crear negocio
                        </button>
                      </form>
                    </section>
                  </section>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <ModalShell open={clientModalOpen} onClose={() => setClientModalOpen(false)} title="Nuevo cliente">
        <form className="form-grid" onSubmit={submitContact}>
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
            <span>Etiquetas</span>
            <input
              value={contactForm.tags}
              onChange={(event) => setContactForm((current) => ({ ...current, tags: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Notas</span>
            <textarea
              value={contactForm.notes}
              onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => setClientModalOpen(false)}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              Crear cliente
            </button>
          </div>
        </form>
      </ModalShell>
    </>
  );
}

function OverviewCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="overview-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function CalendarToolbar({
  mode,
  onModeChange,
  label,
  onPrev,
  onNext,
  onToday
}: {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="calendar-toolbar">
      <div className="calendar-nav">
        <button className="topbar-utility" type="button" onClick={onPrev}>
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <div>
          <p className="eyebrow">Calendario</p>
          <h2>{label}</h2>
        </div>
        <button className="topbar-utility" type="button" onClick={onNext}>
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div className="calendar-toolbar-actions">
        <div className="segmented-control" role="tablist" aria-label="Vista calendario">
          {calendarModes.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? "segment active" : "segment"}
              type="button"
              onClick={() => onModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button className="ghost-button" type="button" onClick={onToday}>
          Hoy
        </button>
      </div>
    </div>
  );
}

function DayBoard({
  appointments,
  contactsById,
  servicesById,
  timezone,
  onStatusChange
}: {
  appointments: Appointment[];
  contactsById: Map<string, Contact>;
  servicesById: Map<string, DashboardSummary["services"][number]>;
  timezone: string;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
}) {
  return (
    <div className="day-board">
      {appointments.length ? (
        appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            contact={contactsById.get(appointment.contactId)}
            serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
            timezone={timezone}
            onStatusChange={onStatusChange}
          />
        ))
      ) : (
        <EmptyState title="Sin citas en el dia" detail="Selecciona otra fecha o crea una nueva reserva." />
      )}
    </div>
  );
}

function WeekBoard({
  weekColumns,
  contactsById,
  servicesById,
  timezone,
  selectedDate,
  onSelectDate
}: {
  weekColumns: Array<{ isoDate: string; appointments: Appointment[] }>;
  contactsById: Map<string, Contact>;
  servicesById: Map<string, DashboardSummary["services"][number]>;
  timezone: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="week-board">
      {weekColumns.map((column) => (
        <button
          key={column.isoDate}
          className={column.isoDate === selectedDate ? "week-column active" : "week-column"}
          type="button"
          onClick={() => onSelectDate(column.isoDate)}
        >
          <div className="week-column-head">
            <span>{weekdayLabelMondayFirst[(new Date(`${column.isoDate}T00:00:00.000Z`).getUTCDay() + 6) % 7]}</span>
            <strong>{shortDateLabel(column.isoDate)}</strong>
          </div>
          <div className="week-column-events">
            {column.appointments.length ? (
              column.appointments.slice(0, 5).map((appointment) => (
                <span key={appointment.id} className={`week-event ${appointment.status}`}>
                  {timeLabel(appointment.startAt, timezone)} · {contactsById.get(appointment.contactId)?.name || "Cliente"}
                  <small>{servicesById.get(appointment.serviceId)?.name || "Servicio"}</small>
                </span>
              ))
            ) : (
              <span className="week-empty">Libre</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function MonthBoard({
  calendar,
  selectedDate,
  monthCellsByDate,
  contactsById,
  timezone,
  onSelectDate
}: {
  calendar: ReturnType<typeof monthGrid>;
  selectedDate: string;
  monthCellsByDate: Map<string, Appointment[]>;
  contactsById: Map<string, Contact>;
  timezone: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="month-board">
      <div className="month-head">
        {weekdayLabelMondayFirst.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="month-grid">
        {calendar.days.map((day) => {
          const appointments = monthCellsByDate.get(day.iso) ?? [];
          return (
            <button
              key={day.iso}
              className={selectedDate === day.iso ? "month-cell active" : day.inMonth ? "month-cell" : "month-cell muted"}
              type="button"
              onClick={() => onSelectDate(day.iso)}
            >
              <span className="cell-date">{day.day}</span>
              <div className="month-cell-events">
                {appointments.slice(0, 3).map((appointment) => (
                  <span key={appointment.id} className={`event-chip ${appointment.status}`}>
                    {timeLabel(appointment.startAt, timezone)} {contactsById.get(appointment.contactId)?.name || "Cliente"}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompactAppointmentRow({
  appointment,
  contactName,
  serviceName,
  timezone
}: {
  appointment: Appointment;
  contactName: string;
  serviceName: string;
  timezone: string;
}) {
  return (
    <article className="compact-appointment-row">
      <strong>{timeLabel(appointment.startAt, timezone)}</strong>
      <div>
        <span>{contactName}</span>
        <p>{serviceName}</p>
      </div>
      <span className={`status-badge ${appointment.status}`}>{statusLabel[appointment.status]}</span>
    </article>
  );
}

function InsightTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="insight-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AppointmentCard({
  appointment,
  contact,
  serviceName,
  timezone,
  onStatusChange
}: {
  appointment: Appointment;
  contact?: Contact;
  serviceName: string;
  timezone: string;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
}) {
  const statusClass = `status-badge ${appointment.status}`;
  const initials = (contact?.name || "CL")
    .split(" ")
    .map((piece) => piece[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="appointment-card">
      <div className="appointment-card-top">
        <div className="client-inline">
          <div className="client-avatar">{initials}</div>
          <div>
            <strong>{contact?.name || "Cliente"}</strong>
            <span>{contact?.phone || "Sin telefono"}</span>
          </div>
        </div>
        <span className={statusClass}>{statusLabel[appointment.status]}</span>
      </div>

      <div className="appointment-card-body">
        <div className="time-row">
          <strong>{timeLabel(appointment.startAt, timezone)}</strong>
          <span>{serviceName}</span>
        </div>
        {appointment.notes && <p>{appointment.notes}</p>}
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

function StatusToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className="status-toggle">
      <span>{label}</span>
      <button
        className={checked ? "toggle-switch on" : "toggle-switch"}
        type="button"
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

function ModalShell({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Clientes</p>
            <h2>{title}</h2>
          </div>
          <button className="topbar-utility" type="button" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span className="material-symbols-outlined">forum</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export default App;
