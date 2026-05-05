import { Dispatch, FormEvent, SetStateAction, startTransition, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  AdminClientSummary,
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
const PLATFORM_ADMIN_EMAIL = "asogomez22@gmail.com";
const weekdayLabel = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const calendarHours = Array.from({ length: 12 }, (_, index) => index + 8);
const viewTabs = [
  { id: "overview", label: "Resumen", icon: "dashboard" },
  { id: "agenda", label: "Agenda", icon: "calendar_month" },
  { id: "clients", label: "Clientes", icon: "groups" },
  { id: "inbox", label: "WhatsApp", icon: "forum" },
  { id: "setup", label: "Ajustes", icon: "settings" },
  { id: "admin", label: "Admin", icon: "admin_panel_settings" }
] as const;

type ViewId = (typeof viewTabs)[number]["id"];
type CalendarMode = "day" | "week" | "month";

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
    title: "Centro de control",
    description: "Agenda, clientes, automatizaciones y facturacion organizadas para decidir rapido sin perder contexto."
  },
  agenda: {
    eyebrow: "Calendario",
    title: "Agenda",
    description: "Planificacion diaria, semanal y mensual con estados visibles y alta de citas desde un flujo enfocado."
  },
  clients: {
    eyebrow: "CRM",
    title: "Clientes",
    description: "Directorio comercial editable, preparado para seguimiento por telefono, email y etiquetas."
  },
  inbox: {
    eyebrow: "WhatsApp",
    title: "Conversaciones",
    description: "Mensajes recientes y pruebas del flujo automatizado desde un unico lugar."
  },
  setup: {
    eyebrow: "Ajustes",
    title: "Configuracion",
    description: "Perfil del negocio, canal de WhatsApp, servicios, disponibilidad y reglas de automatizacion."
  },
  admin: {
    eyebrow: "Platform admin",
    title: "Clientes y planes",
    description: "Alta de clientes, credenciales, plan contratado y estado de facturacion desde una sola vista."
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
  billingStatus: "unconfigured" as BillingStatus,
  active: true
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

const defaultLoginForm = {
  email: "",
  password: ""
};

const defaultAdminClientForm = {
  businessName: "",
  businessEmail: "",
  phone: "",
  city: "",
  address: "",
  timezone: "Europe/Madrid",
  notes: "",
  plan: "full_pack" as PlanCode,
  googleReviewLink: "https://g.page/r/demo-review-link",
  billingStatus: "trial" as BillingStatus,
  ownerName: "",
  ownerEmail: "",
  ownerPassword: ""
};

const addDays = (isoDate: string, days: number) => {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const getWeekDates = (isoDate: string) => {
  const selected = new Date(`${isoDate}T00:00:00.000Z`);
  const mondayOffset = (selected.getUTCDay() + 6) % 7;
  const monday = new Date(selected);
  monday.setUTCDate(selected.getUTCDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
};

const getMonthDates = (isoDate: string) => {
  const selected = new Date(`${isoDate}T00:00:00.000Z`);
  const first = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      iso: date.toISOString().slice(0, 10),
      inMonth: date.getUTCMonth() === selected.getUTCMonth()
    };
  });
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
  const [loadingAdminClients, setLoadingAdminClients] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [view, setView] = useState<ViewId>("overview");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [adminClients, setAdminClients] = useState<AdminClientSummary[]>([]);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
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
  const [adminClientForm, setAdminClientForm] = useState(defaultAdminClientForm);
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
  const isPlatformOwner = session?.user.email.toLowerCase() === PLATFORM_ADMIN_EMAIL;

  const applySession = (nextSession: AuthSession) => {
    api.setToken(nextSession.token);
    setSession({
      user: nextSession.user,
      businesses: nextSession.businesses
    });
    setSelectedBusinessId(nextSession.businesses[0]?.id || "");
    if (!nextSession.businesses.length && nextSession.user.role === "platform_admin") {
      setView("admin");
    }
    setDashboard(null);
    setPageError(null);
    setNotice(null);
  };

  useEffect(() => {
    let cancelled = false;

    const loadApp = async () => {
      setAppLoading(true);
      try {
        if (api.getToken()) {
          try {
            const currentSession = await api.getSession();
            if (cancelled) {
              return;
            }

            applySession({
              token: api.getToken(),
              user: currentSession.user,
              businesses: currentSession.businesses
            });
          } catch {
            api.setToken("");
            if (!cancelled) {
              setSession(null);
            }
          }
        } else {
          setSession(null);
        }
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
    if (!businessId || isPlatformOwner) {
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
    if (!selectedBusinessId || !session || isPlatformOwner) {
      return;
    }

    void refreshDashboard(selectedBusinessId, date);
  }, [date, isPlatformOwner, selectedBusinessId, session]);

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
      billingStatus: dashboard.business.billingStatus,
      active: dashboard.business.active
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
  const visibleTabs = useMemo(
    () => viewTabs.filter((tab) => tab.id !== "admin" || session?.user.role === "platform_admin"),
    [session?.user.role]
  );
  const activeView = viewMeta[view];

  const subscribedBusinesses = useMemo(
    () => (session?.businesses ?? []).filter((business) => business.active && business.billingStatus !== "unconfigured"),
    [session?.businesses]
  );

  const selectedAdminBusiness = useMemo(
    () =>
      session?.businesses.find((business) => business.id === selectedBusinessId) ??
      subscribedBusinesses[0] ??
      session?.businesses[0] ??
      null,
    [selectedBusinessId, session?.businesses, subscribedBusinesses]
  );

  const adminMetrics = useMemo(() => {
    const activeSubscriptions = subscribedBusinesses.filter((business) => business.billingStatus === "active").length;
    const pendingSubscriptions = subscribedBusinesses.filter((business) => business.billingStatus === "past_due").length;
    const monthlyRevenue = subscribedBusinesses
      .filter((business) => business.billingStatus === "active" || business.billingStatus === "trial")
      .reduce((total, business) => total + business.planPriceMonthly, 0);

    return {
      activeSubscriptions,
      monthlyRevenue,
      pendingSubscriptions,
      subscribedCount: subscribedBusinesses.length
    };
  }, [subscribedBusinesses]);

  useEffect(() => {
    if (!isPlatformOwner) {
      return;
    }

    if (!subscribedBusinesses.length) {
      setSelectedBusinessId("");
      return;
    }

    if (!subscribedBusinesses.some((business) => business.id === selectedBusinessId)) {
      setSelectedBusinessId(subscribedBusinesses[0].id);
    }
  }, [isPlatformOwner, selectedBusinessId, subscribedBusinesses]);

  useEffect(() => {
    if (!isPlatformOwner || !selectedAdminBusiness) {
      return;
    }

    setBusinessForm({
      name: selectedAdminBusiness.name,
      email: selectedAdminBusiness.email,
      phone: selectedAdminBusiness.phone,
      city: selectedAdminBusiness.city,
      address: selectedAdminBusiness.address || "",
      timezone: selectedAdminBusiness.timezone,
      notes: selectedAdminBusiness.notes || "",
      plan: selectedAdminBusiness.plan,
      googleReviewLink: selectedAdminBusiness.googleReviewLink,
      billingStatus: selectedAdminBusiness.billingStatus,
      active: selectedAdminBusiness.active
    });
  }, [isPlatformOwner, selectedAdminBusiness]);

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
  const selectedWeek = useMemo(() => getWeekDates(date), [date]);
  const selectedMonth = useMemo(() => getMonthDates(date), [date]);
  const pendingAppointments = dashboard?.appointments.filter((appointment) => appointment.status === "pending").length ?? 0;
  const unconfirmedAppointments =
    dashboard?.appointments.filter((appointment) => appointment.status === "scheduled").length ?? 0;
  const confirmedAppointments =
    dashboard?.appointments.filter((appointment) => appointment.status === "confirmed" || appointment.status === "completed").length ?? 0;
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!dashboard || !query) {
      return dashboard?.contacts.slice(0, 6) ?? [];
    }

    return dashboard.contacts
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.phone.toLowerCase().includes(query) ||
          (contact.email ?? "").toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [contactSearch, dashboard]);

  const automationScore = dashboard
    ? Math.round(
        ([
          dashboard.automation.reviewsReady,
          dashboard.automation.remindersReady,
          dashboard.automation.autoBookingReady,
          dashboard.automation.handoffReady
        ].filter(Boolean).length /
          4) *
          100
      )
    : 0;

  const activeAppointments = dashboard
    ? dashboard.appointments.filter((appointment) => ["pending", "scheduled", "confirmed"].includes(appointment.status)).length
    : 0;

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

  const refreshAdminClients = async () => {
    if (session?.user.role !== "platform_admin") {
      return;
    }

    setLoadingAdminClients(true);
    try {
      setAdminClients(await api.getAdminClients());
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No se pudieron cargar los clientes");
    } finally {
      setLoadingAdminClients(false);
    }
  };

  useEffect(() => {
    if (session?.user.role === "platform_admin") {
      void refreshAdminClients();
    }
  }, [session?.user.role]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setPageError(null);

    try {
      const nextSession = await api.login(loginForm);
      applySession(nextSession);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No se pudo iniciar sesion");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    api.setToken("");
    setSession(null);
    setDashboard(null);
    setAdminClients([]);
    setSelectedBusinessId("");
    setView("overview");
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
      setAppointmentModalOpen(false);
      setContactSearch("");
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

  const saveAdminBusinessSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAdminBusiness) {
      return;
    }

    await performAction(async () => {
      await api.updateBusiness(selectedAdminBusiness.id, businessForm);
      await refreshBusinesses(selectedAdminBusiness.id);
    }, "Negocio actualizado");
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
      setContactModalOpen(false);
      setEditingContactId(null);
      await refreshDashboard(dashboard.business.id, date);
    }, "Contacto creado");
  };

  const openNewContactModal = () => {
    setEditingContactId(null);
    setContactForm({
      name: "",
      phone: "",
      email: "",
      notes: "",
      tags: "lead, nuevo"
    });
    setContactModalOpen(true);
  };

  const openEditContactModal = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email || "",
      notes: contact.notes || "",
      tags: contact.tags.join(", ")
    });
    setContactModalOpen(true);
  };

  const saveContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!dashboard) {
      return;
    }

    if (!editingContactId) {
      await addContact(event);
      return;
    }

    await performAction(async () => {
      await api.updateContact(dashboard.business.id, editingContactId, {
        name: contactForm.name,
        phone: contactForm.phone,
        email: contactForm.email || undefined,
        notes: contactForm.notes || undefined,
        tags: normalizeTags(contactForm.tags)
      });
      setContactModalOpen(false);
      setEditingContactId(null);
      await refreshDashboard(dashboard.business.id, date);
    }, "Cliente actualizado");
  };

  const deleteContact = async (contactId: string) => {
    if (!dashboard || !window.confirm("Eliminar este cliente?")) {
      return;
    }

    await performAction(async () => {
      await api.deleteContact(dashboard.business.id, contactId);
      await refreshDashboard(dashboard.business.id, date);
    }, "Cliente eliminado");
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
        billingStatus: isPlatformOwner ? "trial" : "unconfigured"
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
      if (!isPlatformOwner) {
        await refreshDashboard(business.id, date);
        setView("setup");
      }
    }, "Nuevo negocio creado");
  };

  const createAdminClient = async (event: FormEvent) => {
    event.preventDefault();

    await performAction(async () => {
      const client = await api.createAdminClient({
        ...adminClientForm,
        address: adminClientForm.address || undefined,
        notes: adminClientForm.notes || undefined
      });
      setAdminClientForm(defaultAdminClientForm);
      await refreshBusinesses(client.business.id);
      await refreshAdminClients();
      setView("setup");
    }, "Cliente creado con usuario y plan asignado");
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
      <div className="login-shell">
        <section className="login-panel">
          <div className="login-copy">
            <p className="eyebrow">TarracoWebs · WhatsApp CRM</p>
            <h1>Agenda, WhatsApp y clientes en un unico panel.</h1>
            <p className="muted">
              Accede al centro operativo para gestionar citas, automatizaciones anti no-show y solicitudes de resena.
            </p>
            <div className="login-proof-grid" aria-label="Capacidades principales">
              <span>Agenda en tiempo real</span>
              <span>Flujos WhatsApp</span>
              <span>Facturacion SaaS</span>
            </div>
          </div>

          <form className="login-form" onSubmit={submitLogin}>
            <div>
              <p className="eyebrow">Acceso privado</p>
              <h2>Iniciar sesion</h2>
            </div>
            {pageError && <div className="error-banner">{pageError}</div>}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <button className="primary" type="submit" disabled={loginLoading}>
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
            <p className="form-footnote">Usa las credenciales asignadas a tu negocio o usuario administrador.</p>
          </form>
        </section>
      </div>
    );
  }

  if (isPlatformOwner) {
    return (
      <div className="app-shell admin-shell">
        <main className="admin-workspace">
          <header className="hero-panel admin-hero">
            <div className="hero-copy">
              <p className="eyebrow">Consola admin</p>
              <h1>Alta y control de clientes SaaS</h1>
              <p className="hero-description">
                Crea el negocio, asigna el plan y deja al usuario activo con su contraseña inicial en una sola operacion.
              </p>
              <div className="hero-pill-row">
                <span className="hero-pill">{adminMetrics.subscribedCount} negocios</span>
                <span className="hero-pill accent">{moneyLabel(adminMetrics.monthlyRevenue)} / mes</span>
                <span className="hero-pill">{adminClients.length} altas totales</span>
              </div>
            </div>

            <div className="admin-profile-panel">
              <div className="profile-card">
                <span className="eyebrow">Sesion</span>
                <strong>{session.user.name}</strong>
                <span className="muted">Administrador de plataforma</span>
                <button className="secondary" type="button" onClick={logout}>
                  Cerrar sesion
                </button>
              </div>
            </div>
          </header>

          {pageError && <div className="error-banner">{pageError}</div>}
          {notice && <div className="notice-banner">{notice}</div>}

          <section className="metrics-grid admin-metrics">
            <MetricCard label="Suscritos" value={String(adminMetrics.subscribedCount)} description="Activos con billing configurado" icon="storefront" tone="teal" />
            <MetricCard label="MRR" value={moneyLabel(adminMetrics.monthlyRevenue)} description="Planes activos o en trial" icon="payments" tone="ink" />
            <MetricCard label="Activos" value={String(adminMetrics.activeSubscriptions)} description="Billing marcado como activo" icon="verified" tone="sage" />
            <MetricCard label="Pendientes" value={String(adminMetrics.pendingSubscriptions)} description="Pagos past due para revisar" icon="warning" tone="rust" />
          </section>

          <section className="admin-layout">
            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Cartera</p>
                  <h3>Clientes creados</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => void refreshAdminClients()}>
                  {loadingAdminClients ? "Actualizando..." : "Actualizar"}
                </button>
              </div>

              <div className="business-list">
                {loadingAdminClients ? (
                  <div className="empty-card">Cargando clientes...</div>
                ) : adminClients.length ? (
                  adminClients.map(({ business, users }) => (
                    <button
                      key={business.id}
                      className={selectedAdminBusiness?.id === business.id ? "business-card active" : "business-card"}
                      type="button"
                      onClick={() => setSelectedBusinessId(business.id)}
                    >
                      <span className="business-card-main">
                        <strong>{business.name}</strong>
                        <span>{business.city} · {planLabel[business.plan]} · {users.length} usuario{users.length === 1 ? "" : "s"}</span>
                      </span>
                      <span className={`status-chip ${business.billingStatus}`}>{billingLabel[business.billingStatus]}</span>
                      <span className="muted">{users[0]?.email || business.email}</span>
                    </button>
                  ))
                ) : (
                  <div className="empty-card">Todavia no hay clientes creados desde la consola admin.</div>
                )}
              </div>
            </section>

            <aside className="stack-column">
              <section className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Administrar</p>
                    <h3>{selectedAdminBusiness?.name || "Selecciona un negocio"}</h3>
                  </div>
                </div>

                {selectedAdminBusiness ? (
                  <form className="form-grid" onSubmit={saveAdminBusinessSettings}>
                    <label className="field">
                      <span>Nombre</span>
                      <input value={businessForm.name} onChange={(event) => setBusinessForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Email</span>
                        <input value={businessForm.email} onChange={(event) => setBusinessForm((current) => ({ ...current, email: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Telefono</span>
                        <input value={businessForm.phone} onChange={(event) => setBusinessForm((current) => ({ ...current, phone: event.target.value }))} />
                      </label>
                    </div>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Ciudad</span>
                        <input value={businessForm.city} onChange={(event) => setBusinessForm((current) => ({ ...current, city: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Direccion</span>
                        <input value={businessForm.address} onChange={(event) => setBusinessForm((current) => ({ ...current, address: event.target.value }))} />
                      </label>
                    </div>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Plan</span>
                        <select value={businessForm.plan} onChange={(event) => setBusinessForm((current) => ({ ...current, plan: event.target.value as PlanCode }))}>
                          {Object.entries(planLabel).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Billing</span>
                        <select value={businessForm.billingStatus} onChange={(event) => setBusinessForm((current) => ({ ...current, billingStatus: event.target.value as BillingStatus }))}>
                          {Object.entries(billingLabel).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span>Google review link</span>
                      <input value={businessForm.googleReviewLink} onChange={(event) => setBusinessForm((current) => ({ ...current, googleReviewLink: event.target.value }))} />
                    </label>
                    <label className="field">
                      <span>Notas internas</span>
                      <textarea value={businessForm.notes} onChange={(event) => setBusinessForm((current) => ({ ...current, notes: event.target.value }))} />
                    </label>
                    <label className="toggle-item admin-toggle">
                      <input type="checkbox" checked={businessForm.active} onChange={(event) => setBusinessForm((current) => ({ ...current, active: event.target.checked }))} />
                      <span>Negocio activo</span>
                    </label>
                    <button className="primary" type="submit">Guardar cambios</button>
                  </form>
                ) : (
                  <div className="empty-card">No hay ningun negocio suscrito para administrar.</div>
                )}
              </section>

              <section className="panel compact-admin-panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Alta directa</p>
                    <h3>Nuevo cliente con acceso</h3>
                  </div>
                </div>

                <div className="admin-onboarding-steps" aria-label="Proceso de alta">
                  <span>1. Negocio</span>
                  <span>2. Plan</span>
                  <span>3. Usuario activo</span>
                </div>

                <form className="form-grid admin-create-form" onSubmit={createAdminClient}>
                  <label className="field">
                    <span>Negocio</span>
                    <input value={adminClientForm.businessName} onChange={(event) => setAdminClientForm((current) => ({ ...current, businessName: event.target.value }))} required />
                  </label>
                  <div className="inline-grid">
                    <label className="field">
                      <span>Email negocio</span>
                      <input type="email" value={adminClientForm.businessEmail} onChange={(event) => setAdminClientForm((current) => ({ ...current, businessEmail: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>Telefono</span>
                      <input value={adminClientForm.phone} onChange={(event) => setAdminClientForm((current) => ({ ...current, phone: event.target.value }))} required />
                    </label>
                  </div>
                  <div className="inline-grid">
                    <label className="field">
                      <span>Ciudad</span>
                      <input value={adminClientForm.city} onChange={(event) => setAdminClientForm((current) => ({ ...current, city: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>Plan</span>
                      <select value={adminClientForm.plan} onChange={(event) => setAdminClientForm((current) => ({ ...current, plan: event.target.value as PlanCode }))}>
                        {Object.entries(planLabel).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="inline-grid">
                    <label className="field">
                      <span>Billing</span>
                      <select value={adminClientForm.billingStatus} onChange={(event) => setAdminClientForm((current) => ({ ...current, billingStatus: event.target.value as BillingStatus }))}>
                        {Object.entries(billingLabel).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Timezone</span>
                      <input value={adminClientForm.timezone} onChange={(event) => setAdminClientForm((current) => ({ ...current, timezone: event.target.value }))} required />
                    </label>
                  </div>
                  <label className="field">
                    <span>Review link</span>
                    <input type="url" value={adminClientForm.googleReviewLink} onChange={(event) => setAdminClientForm((current) => ({ ...current, googleReviewLink: event.target.value }))} required />
                  </label>
                  <div className="admin-access-card">
                    <div>
                      <p className="eyebrow">Acceso del cliente</p>
                      <strong>Usuario business admin</strong>
                    </div>
                    <label className="field">
                      <span>Nombre usuario</span>
                      <input value={adminClientForm.ownerName} onChange={(event) => setAdminClientForm((current) => ({ ...current, ownerName: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>Email usuario</span>
                      <input type="email" autoComplete="off" value={adminClientForm.ownerEmail} onChange={(event) => setAdminClientForm((current) => ({ ...current, ownerEmail: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>Contrasena inicial</span>
                      <input type="password" autoComplete="new-password" minLength={10} value={adminClientForm.ownerPassword} onChange={(event) => setAdminClientForm((current) => ({ ...current, ownerPassword: event.target.value }))} required />
                    </label>
                  </div>
                  <label className="field">
                    <span>Notas internas</span>
                    <textarea value={adminClientForm.notes} onChange={(event) => setAdminClientForm((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                  <button className="primary" type="submit">Crear cliente y activar usuario</button>
                </form>
              </section>
            </aside>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-grid">
        <aside className="side-rail">
          <div className="brand-block">
            <p className="eyebrow">TarracoWebs</p>
            <h2>WhatsApp CRM</h2>
            <span className="muted">Control diario de clientes, agenda y automatizaciones.</span>
          </div>

        <nav className="sidebar-nav">
          {visibleTabs.map((tab) => (
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
            <span className="eyebrow">Sesion</span>
            <strong>{session.user.name}</strong>
            <span className="muted">{session.user.email}</span>
            <span className="role-pill">{session.user.role.replace("_", " ")}</span>
          </div>
          <button className="ghost-button sidebar-logout" type="button" onClick={logout}>
            Cerrar sesion
          </button>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="topbar-title">TarracoWebs CRM</div>
        <div className="topbar-actions">
          <label className="field topbar-field">
            <span>Negocio</span>
            <select
              value={selectedBusinessId}
              onChange={(event) => setSelectedBusinessId(event.target.value)}
              disabled={!session.businesses.length}
            >
              {!session.businesses.length && <option value="">Sin negocios</option>}
              {session.businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
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

        <main className="workspace">
          <header className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Panel del negocio</p>
              <h1>{selectedBusiness?.name || "Selecciona un negocio"}</h1>
              <p className="hero-description">
                Prioriza lo importante: citas de hoy, clientes por confirmar, estado del canal y pasos pendientes para
                dejar WhatsApp vendiendo por ti.
              </p>
              <div className="hero-pill-row">
                <span className="hero-pill">{selectedBusiness ? planLabel[selectedBusiness.plan] : "Sin plan"}</span>
                <span className="hero-pill accent">
                  {selectedBusiness ? moneyLabel(selectedBusiness.planPriceMonthly) : "--"}
                </span>
                <span className="hero-pill">
                  {dashboard ? billingLabel[dashboard.billing.status] : "Cargando billing"}
                </span>
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-status-grid">
                <div className="progress-card">
                  <span className="eyebrow">Onboarding</span>
                  <strong>{dashboard?.onboarding.completionRatio ?? 0}%</strong>
                  <span className="muted">
                    {dashboard
                      ? `${dashboard.onboarding.completed} de ${dashboard.onboarding.total} hitos operativos`
                      : "Sin datos"}
                  </span>
                </div>

                <div className="hero-status-card">
                  <span className="eyebrow">Automatizacion</span>
                  <strong>{automationScore}%</strong>
                  <span className="muted">Preparacion real del canal</span>
                </div>
              </div>

              <div className="hero-actions">
                <label className="field compact-field">
                  <span>Fecha</span>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <button className="secondary" type="button" onClick={() => void runAutomations()}>
                  Procesar automatizaciones
                </button>
                <button className="ghost-button" type="button" onClick={() => void openBillingLink("checkout")}>
                  Checkout Stripe
                </button>
                <button className="ghost-button" type="button" onClick={() => void openBillingLink("portal")}>
                  Billing portal
                </button>
              </div>
            </div>
          </header>

          {pageError && <div className="error-banner">{pageError}</div>}
          {notice && <div className="notice-banner">{notice}</div>}

          {loadingDashboard || !dashboard ? (
            <div className="loading-stage">Cargando datos del negocio...</div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <section className="metrics-grid">
                    <MetricCard
                      label="Citas hoy"
                      value={String(dashboard.metrics.todayAppointments)}
                      description={`${activeAppointments} siguen activas o pendientes`}
                      tone="teal"
                    />
                    <MetricCard
                      label="Pendientes"
                      value={String(dashboard.metrics.pendingConfirmations)}
                      description="Confirmaciones todavia abiertas"
                      tone="rust"
                    />
                    <MetricCard
                      label="Leads"
                      value={String(dashboard.metrics.leadsTracked)}
                      description="Contactos con interes detectado"
                      tone="sage"
                    />
                    <MetricCard
                      label="Confirmacion"
                      value={`${dashboard.metrics.confirmedRate}%`}
                      description="Ratio historico de citas confirmadas"
                      tone="ink"
                    />
                  </section>

                  <section className="action-strip">
                    <div>
                      <p className="eyebrow">Siguiente mejor accion</p>
                      <strong>
                        {dashboard.onboarding.completionRatio < 100
                          ? "Termina el onboarding para activar todo el flujo"
                          : dashboard.metrics.pendingConfirmations
                            ? "Revisa las confirmaciones pendientes"
                            : "El negocio esta listo para operar hoy"}
                      </strong>
                      <span className="muted">
                        {dashboard.onboarding.completionRatio < 100
                          ? "Completa canal, servicios y disponibilidad antes de escalar conversaciones."
                          : dashboard.metrics.pendingConfirmations
                            ? "Prioriza clientes que aun no han confirmado para reducir no-shows."
                            : "Mantén automatizaciones procesadas y revisa los mensajes recientes."}
                      </span>
                    </div>
                    <div className="action-strip-buttons">
                      <button className="primary" type="button" onClick={() => setView("agenda")}>
                        Ver agenda
                      </button>
                      <button className="secondary" type="button" onClick={() => setView("setup")}>
                        Completar ajustes
                      </button>
                    </div>
                  </section>

                  <section className="workspace-grid">
                    <section className="panel span-two">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Agenda inmediata</p>
                          <h3>Proxima actividad</h3>
                        </div>
                        <span className="muted">{dashboard.appointments.length} citas en el dia</span>
                      </div>

                      <div className="next-callout">
                        <div>
                          <strong>{nextAppointment ? timeLabel(nextAppointment.startAt, dashboard.business.timezone) : "Sin huecos activos"}</strong>
                          <p className="muted">
                            {nextAppointment
                              ? `${contactsById.get(nextAppointment.contactId)?.name || "Paciente"} · ${
                                  servicesById.get(nextAppointment.serviceId)?.name || "Servicio"
                                }`
                              : "La agenda de hoy esta despejada"}
                          </p>
                        </div>
                        <button className="secondary" type="button" onClick={() => setView("agenda")}>
                          Ir a agenda
                        </button>
                      </div>

                      <div className="stack-list">
                        {dashboard.appointments.length ? (
                          dashboard.appointments.slice(0, 5).map((appointment) => (
                            <AppointmentRow
                              key={appointment.id}
                              appointment={appointment}
                              contactName={contactsById.get(appointment.contactId)?.name || "Paciente"}
                              serviceName={servicesById.get(appointment.serviceId)?.name || "Servicio"}
                              timezone={dashboard.business.timezone}
                              onStatusChange={updateStatus}
                            />
                          ))
                        ) : (
                          <div className="empty-card empty-state">
                            <strong>Dia despejado</strong>
                            <span>Crea una cita manual o deja que WhatsApp capture la siguiente oportunidad.</span>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="panel">
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
                  </section>

                  <section className="workspace-grid">
                    <section className="panel">
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

                    <section className="panel">
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
                        {dashboard.recentMessages.length ? (
                          dashboard.recentMessages.slice(0, 6).map((message) => (
                            <MessageRow
                              key={message.id}
                              message={message}
                              contactName={contactsById.get(message.contactId)?.name || "Paciente"}
                              timezone={dashboard.business.timezone}
                            />
                          ))
                        ) : (
                          <div className="empty-card empty-state">
                            <strong>Sin mensajes recientes</strong>
                            <span>Cuando entren conversaciones o recordatorios apareceran aqui.</span>
                          </div>
                        )}
                      </div>
                    </section>
                  </section>
                </>
              )}

              {view === "agenda" && (
                <section className="workspace-grid">
                  <section className="panel span-two">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Operacion</p>
                        <h3>Prioridad inmediata</h3>
                      </div>
                      <span className={`status-badge ${nextAppointment?.status || "scheduled"}`}>
                        {nextAppointment ? statusLabel[nextAppointment.status] : "Sin urgencias"}
                      </span>
                    </div>

                    <div className="highlight-callout">
                      <div>
                        <span className="eyebrow">Siguiente cita</span>
                        <strong>
                          {nextAppointment
                            ? contactsById.get(nextAppointment.contactId)?.name || "Cliente"
                            : "Agenda despejada"}
                        </strong>
                        <p>
                          {nextAppointment
                            ? `${dateTimeLabel(nextAppointment.startAt, dashboard.business.timezone)} · ${
                                servicesById.get(nextAppointment.serviceId)?.name || "Servicio"
                              }`
                            : "No hay citas pendientes, programadas o confirmadas para esta fecha."}
                        </p>
                      </div>
                      <button className="primary" type="button" onClick={() => setView("agenda")}>
                        Abrir agenda
                      </button>
                    </div>

                    <div className="mini-stats">
                      <MiniStat label="No-shows" value={String(dashboard.metrics.noShows)} />
                      <MiniStat label="Resenas pendientes" value={String(dashboard.metrics.reviewsPending)} />
                      <MiniStat label="Flujos abiertos" value={String(dashboard.metrics.whatsappOpenFlows)} />
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-4">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Onboarding</p>
                        <h3>{dashboard.onboarding.completed}/{dashboard.onboarding.total} completado</h3>
                      </div>
                    </div>
                    <div className="progress-rail" aria-label={`Onboarding ${dashboard.onboarding.completionRatio}% completado`}>
                      <span style={{ width: `${dashboard.onboarding.completionRatio}%` }} />
                    </div>
                    <div className="checklist-list">
                      {dashboard.onboarding.items.slice(0, 4).map((item) => (
                        <ChecklistRow key={item.id} item={item} />
                      ))}
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-7">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Automatizaciones</p>
                        <h3>Senales del sistema</h3>
                      </div>
                      <button className="secondary" type="button" onClick={() => void runAutomations()}>
                        Procesar ahora
                      </button>
                    </div>
                    <div className="signal-grid">
                      <SignalCard label="Resenas" status={dashboard.automation.reviewsReady} detail="Solicitud tras cita completada." />
                      <SignalCard label="Recordatorios" status={dashboard.automation.remindersReady} detail="Anti no-show antes de la cita." />
                      <SignalCard label="Citas automaticas" status={dashboard.automation.autoBookingReady} detail="Captacion guiada por WhatsApp." />
                      <SignalCard label="Handoff" status={dashboard.automation.handoffReady} detail="Escalada a atencion humana." />
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-5">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">WhatsApp</p>
                        <h3>Simulador de flujo</h3>
                      </div>
                    </div>
                    <form className="form-grid" onSubmit={simulateMessage}>
                      <label className="field">
                        <span>Telefono origen</span>
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
                        Simular mensaje
                      </button>
                    </form>
                  </section>

                  <section className="surface-card dashboard-span-6">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Actividad reciente</p>
                        <h3>Conversaciones</h3>
                      </div>
                    </div>
                    <div className="message-stack">
                      {dashboard.recentMessages.length ? (
                        dashboard.recentMessages.map((message) => (
                          <MessageRow
                            key={message.id}
                            message={message}
                            contactName={contactsById.get(message.contactId)?.name || "Paciente"}
                            timezone={dashboard.business.timezone}
                          />
                        ))
                      ) : (
                        <div className="empty-card empty-state">
                          <strong>No hay conversacion todavia</strong>
                          <span>Usa la simulacion para probar el flujo antes de conectarlo a trafico real.</span>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-6">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Facturacion</p>
                        <h3>{billingLabel[dashboard.billing.status]}</h3>
                      </div>
                    </div>
                    <div className="billing-panel">
                      <MiniStat label="Plan" value={planLabel[dashboard.business.plan]} />
                      <MiniStat label="Mensualidad" value={moneyLabel(dashboard.business.planPriceMonthly)} />
                    </div>
                    <div className="button-row">
                      <button className="secondary" type="button" onClick={() => void openBillingLink("checkout")}>
                        Abrir checkout
                      </button>
                      <button className="ghost-button" type="button" onClick={() => void openBillingLink("portal")}>
                        Portal cliente
                      </button>
                    </div>
                  </section>

                  <section className="surface-card dashboard-span-12">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Navegacion rapida</p>
                        <h3>Atajos principales</h3>
                      </div>
                    </div>
                    <div className="shortcut-grid">
                      <button className="shortcut-card" type="button" onClick={() => setView("agenda")}>
                        <span className="material-symbols-outlined">calendar_month</span>
                        <strong>Citas</strong>
                        <small>{dashboard.appointments.length} en la fecha seleccionada</small>
                      </button>
                      <button className="shortcut-card" type="button" onClick={() => setView("clients")}>
                        <span className="material-symbols-outlined">groups</span>
                        <strong>Clientes</strong>
                        <small>{dashboard.contacts.length} clientes guardados</small>
                      </button>
                      <button className="shortcut-card" type="button" onClick={() => setView("setup")}>
                        <span className="material-symbols-outlined">settings</span>
                        <strong>Ajustes</strong>
                        <small>Perfil, servicios y disponibilidad</small>
                      </button>
                    </div>
                  </section>
                </section>
            )}

            {view === "agenda" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-12">
                  <div className="section-head calendar-head">
                    <div>
                      <p className="eyebrow">Citas</p>
                      <h3>{calendarMode === "day" ? dateLabel(date) : calendarMode === "week" ? "Semana" : "Mes"}</h3>
                    </div>
                    <div className="calendar-toolbar">
                      <div className="date-nav" aria-label="Navegacion de fecha">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Fecha anterior"
                          onClick={() => setDate((current) => addDays(current, -1))}
                        >
                          <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <input className="calendar-date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Fecha siguiente"
                          onClick={() => setDate((current) => addDays(current, 1))}
                        >
                          <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                      </div>
                      <div className="segmented-control">
                        {(["day", "week", "month"] as CalendarMode[]).map((mode) => (
                          <button
                            key={mode}
                            className={calendarMode === mode ? "active" : ""}
                            type="button"
                            onClick={() => setCalendarMode(mode)}
                          >
                            {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mes"}
                          </button>
                        ))}
                      </div>
                      <button className="primary" type="button" onClick={() => setAppointmentModalOpen(true)}>
                        Agendar cita
                      </button>
                    </div>
                  </div>

                  {calendarMode === "day" && (
                    <CalendarDay
                      appointments={dashboard.appointments}
                      contactsById={contactsById}
                      servicesById={servicesById}
                      timezone={dashboard.business.timezone}
                      onStatusChange={updateStatus}
                    />
                  )}

                  {calendarMode === "week" && (
                    <CalendarWeek
                      selectedDate={date}
                      weekDates={selectedWeek}
                      appointments={dashboard.appointments}
                      contactsById={contactsById}
                      servicesById={servicesById}
                      timezone={dashboard.business.timezone}
                      onSelectDate={setDate}
                    />
                  )}

                  {calendarMode === "month" && (
                    <CalendarMonth
                      selectedDate={date}
                      monthDates={selectedMonth}
                      appointments={dashboard.appointments}
                      contactsById={contactsById}
                      onSelectDate={setDate}
                    />
                  )}
                </section>
              </section>
            )}

            {view === "clients" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-12">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Clientes</p>
                      <h3>{dashboard.contacts.length} clientes</h3>
                    </div>
                    <button className="primary" type="button" onClick={openNewContactModal}>
                      Nuevo cliente
                    </button>
                  </div>

                  <div className="contact-table">
                    {dashboard.contacts.length ? (
                      dashboard.contacts.map((contact) => (
                        <article key={contact.id} className="contact-row">
                          <div>
                            <strong>{contact.name}</strong>
                            <span>{contact.email || "Sin email"}</span>
                          </div>
                          <span>{contact.phone}</span>
                          <span>{contact.tags.join(", ") || "Sin tags"}</span>
                          <div className="row-actions">
                            <button className="ghost-button" type="button" onClick={() => openEditContactModal(contact)}>
                              Editar
                            </button>
                            <button className="ghost-button danger" type="button" onClick={() => void deleteContact(contact.id)}>
                              Eliminar
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <EmptyState icon="groups" title="Sin clientes" detail="Crea un cliente para poder agendar citas." />
                    )}
                  </div>
                </section>
              </section>
            )}

            {view === "setup" && (
              <section className="dashboard-grid">
                <section className="surface-card dashboard-span-8">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Negocio</p>
                      <h3>Perfil</h3>
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

                <section className="surface-card dashboard-span-12">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Canal WhatsApp</p>
                      <h3>Conexion y plantillas</h3>
                    </div>
                    <div className="toggle-row">
                      <StatusToggle
                        label="Activo"
                        checked={channelForm.active}
                        onChange={(active) => setChannelForm((current) => ({ ...current, active }))}
                      />
                      <StatusToggle
                        label="Meta verificado"
                        checked={channelForm.metaVerified}
                        onChange={(metaVerified) => setChannelForm((current) => ({ ...current, metaVerified }))}
                      />
                      <StatusToggle
                        label="Templates listos"
                        checked={channelForm.templatesReady}
                        onChange={(templatesReady) => setChannelForm((current) => ({ ...current, templatesReady }))}
                      />
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={saveChannelSettings}>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Telefono E.164</span>
                        <input
                          value={channelForm.phoneE164}
                          onChange={(event) => setChannelForm((current) => ({ ...current, phoneE164: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Nombre visible</span>
                        <input
                          value={channelForm.displayName}
                          onChange={(event) => setChannelForm((current) => ({ ...current, displayName: event.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="inline-grid">
                      <label className="field">
                        <span>Phone number ID</span>
                        <input
                          value={channelForm.phoneNumberId}
                          onChange={(event) => setChannelForm((current) => ({ ...current, phoneNumberId: event.target.value }))}
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
                    <div className="inline-grid">
                      <label className="field">
                        <span>Verify token</span>
                        <input
                          value={channelForm.verifyToken}
                          onChange={(event) => setChannelForm((current) => ({ ...current, verifyToken: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Plantillas</span>
                        <input
                          value={channelForm.templateNames}
                          onChange={(event) => setChannelForm((current) => ({ ...current, templateNames: event.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Access token cifrado</span>
                      <textarea
                        value={channelForm.accessTokenEncrypted}
                        onChange={(event) => setChannelForm((current) => ({ ...current, accessTokenEncrypted: event.target.value }))}
                      />
                    </label>
                    <button className="primary" type="submit">
                      Guardar canal
                    </button>
                  </form>
                </section>

                <section className="surface-card dashboard-span-12">
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
              </section>
            )}
          </>
        )}
        </main>

        {dashboard && appointmentModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <section className="modal-panel">
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Cita</p>
                  <h3>Agendar cita</h3>
                </div>
                <button className="icon-button" type="button" aria-label="Cerrar modal de cita" onClick={() => setAppointmentModalOpen(false)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form className="form-grid" onSubmit={submitAppointment}>
                <label className="field">
                  <span>Cliente</span>
                  <input
                    value={contactSearch}
                    placeholder={contactsById.get(appointmentForm.contactId)?.name || "Buscar cliente"}
                    onChange={(event) => setContactSearch(event.target.value)}
                  />
                </label>
                <div className="contact-suggestions">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      className={appointmentForm.contactId === contact.id ? "selected" : ""}
                      type="button"
                      onClick={() => {
                        setAppointmentForm((current) => ({ ...current, contactId: contact.id }));
                        setContactSearch(contact.name);
                      }}
                    >
                      <strong>{contact.name}</strong>
                      <span>{contact.phone}</span>
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Servicio</span>
                  <select
                    value={appointmentForm.serviceId}
                    onChange={(event) => setAppointmentForm((current) => ({ ...current, serviceId: event.target.value }))}
                  >
                    {dashboard.services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="modal-calendar">
                  <label className="field">
                    <span>Fecha y hora</span>
                    <input
                      type="datetime-local"
                      value={appointmentForm.startAtLocal}
                      onChange={(event) => setAppointmentForm((current) => ({ ...current, startAtLocal: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Notas</span>
                  <textarea
                    value={appointmentForm.notes}
                    onChange={(event) => setAppointmentForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <button className="primary" type="submit">
                  Guardar cita
                </button>
              </form>
            </section>
          </div>
        )}

        {dashboard && contactModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <section className="modal-panel">
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Cliente</p>
                  <h3>{editingContactId ? "Editar cliente" : "Nuevo cliente"}</h3>
                </div>
                <button className="icon-button" type="button" aria-label="Cerrar modal de cliente" onClick={() => setContactModalOpen(false)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form className="form-grid" onSubmit={saveContact}>
                <label className="field">
                  <span>Nombre</span>
                  <input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Telefono</span>
                  <input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Tags</span>
                  <input value={contactForm.tags} onChange={(event) => setContactForm((current) => ({ ...current, tags: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Notas</span>
                  <textarea value={contactForm.notes} onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <button className="primary" type="submit">
                  Guardar cliente
                </button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  tone
}: {
  label: string;
  value: string;
  description: string;
  icon?: string;
  tone?: string;
}) {
  return (
    <article className={tone ? `metric-card ${tone}` : "metric-card"}>
      <div className="metric-card-head">
        <span>{label}</span>
        {icon && <span className="material-symbols-outlined">{icon}</span>}
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}

function WeekStrip({
  selectedDate,
  weekDates,
  onSelectDate
}: {
  selectedDate: string;
  weekDates: string[];
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="week-strip">
      {weekDates.map((item) => (
        <button
          key={item}
          className={item === selectedDate ? "week-day active" : "week-day"}
          type="button"
          onClick={() => onSelectDate(item)}
        >
          <span>{weekdayLabel[new Date(`${item}T00:00:00.000Z`).getUTCDay()]}</span>
          <strong>{shortDateLabel(item)}</strong>
        </button>
      ))}
    </div>
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
          {appointments.length ? (
            appointments.map((appointment) => (
              <article key={appointment.id} className={`calendar-event ${appointment.status}`} style={getCalendarPosition(appointment)}>
                <strong>{contactsById.get(appointment.contactId)?.name || "Paciente"}</strong>
                <span>
                  {timeLabel(appointment.startAt, timezone)} · {servicesById.get(appointment.serviceId)?.name || "Servicio"}
                </span>
              </article>
            ))
          ) : (
            <div className="calendar-empty">
              <span className="material-symbols-outlined">event_available</span>
              <strong>Agenda despejada</strong>
              <p>No hay citas para este dia.</p>
            </div>
          )}
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

function CalendarWeek({
  selectedDate,
  weekDates,
  appointments,
  contactsById,
  servicesById,
  timezone,
  onSelectDate
}: {
  selectedDate: string;
  weekDates: string[];
  appointments: Appointment[];
  contactsById: Map<string, DashboardSummary["contacts"][number]>;
  servicesById: Map<string, DashboardSummary["services"][number]>;
  timezone: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="calendar-week">
      <div className="calendar-week-axis">
        <span />
        {weekDates.map((item) => (
          <button
            key={item}
            className={item === selectedDate ? "week-column-head active" : "week-column-head"}
            type="button"
            onClick={() => onSelectDate(item)}
          >
            <span>{weekdayLabel[new Date(`${item}T00:00:00.000Z`).getUTCDay()]}</span>
            <strong>{shortDateLabel(item)}</strong>
          </button>
        ))}
      </div>
      <div className="calendar-week-grid">
        <div className="week-hours">
          {calendarHours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="week-columns">
          {weekDates.map((item) => (
            <div key={item} className="week-day-column">
              {appointments
                .filter((appointment) => appointment.startAt.slice(0, 10) === item)
                .map((appointment) => (
                  <article key={appointment.id} className={`week-event ${appointment.status}`}>
                    <strong>{timeLabel(appointment.startAt, timezone)}</strong>
                    <span>{contactsById.get(appointment.contactId)?.name || "Paciente"}</span>
                    <small>{servicesById.get(appointment.serviceId)?.name || "Servicio"}</small>
                  </article>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarMonth({
  selectedDate,
  monthDates,
  appointments,
  contactsById,
  onSelectDate
}: {
  selectedDate: string;
  monthDates: Array<{ iso: string; inMonth: boolean }>;
  appointments: Appointment[];
  contactsById: Map<string, DashboardSummary["contacts"][number]>;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="calendar-month">
      {weekdayLabel.slice(1).concat(weekdayLabel[0]).map((label) => (
        <span key={label} className="month-weekday">
          {label}
        </span>
      ))}
      {monthDates.map((item) => {
        const dayAppointments = appointments.filter((appointment) => appointment.startAt.slice(0, 10) === item.iso);
        return (
          <button
            key={item.iso}
            className={`month-cell ${item.inMonth ? "" : "muted-month"} ${item.iso === selectedDate ? "active" : ""}`}
            type="button"
            onClick={() => onSelectDate(item.iso)}
          >
            <strong>{new Date(`${item.iso}T00:00:00.000Z`).getUTCDate()}</strong>
            {dayAppointments.slice(0, 3).map((appointment) => (
              <span key={appointment.id}>{contactsById.get(appointment.contactId)?.name || "Cita"}</span>
            ))}
            {dayAppointments.length > 3 && <small>+{dayAppointments.length - 3}</small>}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span className="material-symbols-outlined">{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
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
        aria-label={label}
        aria-pressed={checked}
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

function AdminClientsView({
  clients,
  form,
  loading,
  planLabel,
  billingLabel,
  onRefresh,
  onSubmit,
  onFormChange
}: {
  clients: AdminClientSummary[];
  form: typeof defaultAdminClientForm;
  loading: boolean;
  planLabel: Record<PlanCode, string>;
  billingLabel: Record<BillingStatus, string>;
  onRefresh: () => void;
  onSubmit: (event: FormEvent) => void;
  onFormChange: Dispatch<SetStateAction<typeof defaultAdminClientForm>>;
}) {
  return (
    <section className="dashboard-grid">
      <section className="surface-card dashboard-span-7">
        <div className="section-head">
          <div>
            <p className="eyebrow">Alta segura</p>
            <h3>Nuevo cliente</h3>
          </div>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <div className="inline-grid">
            <label className="field">
              <span>Negocio</span>
              <input
                value={form.businessName}
                onChange={(event) => onFormChange((current) => ({ ...current, businessName: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Email negocio</span>
              <input
                type="email"
                value={form.businessEmail}
                onChange={(event) => onFormChange((current) => ({ ...current, businessEmail: event.target.value }))}
              />
            </label>
          </div>

          <div className="inline-grid">
            <label className="field">
              <span>Telefono</span>
              <input value={form.phone} onChange={(event) => onFormChange((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label className="field">
              <span>Ciudad</span>
              <input value={form.city} onChange={(event) => onFormChange((current) => ({ ...current, city: event.target.value }))} />
            </label>
          </div>

          <div className="inline-grid">
            <label className="field">
              <span>Direccion</span>
              <input
                value={form.address}
                onChange={(event) => onFormChange((current) => ({ ...current, address: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Timezone</span>
              <input
                value={form.timezone}
                onChange={(event) => onFormChange((current) => ({ ...current, timezone: event.target.value }))}
              />
            </label>
          </div>

          <div className="inline-grid">
            <label className="field">
              <span>Plan</span>
              <select
                value={form.plan}
                onChange={(event) => onFormChange((current) => ({ ...current, plan: event.target.value as PlanCode }))}
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
                value={form.billingStatus}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, billingStatus: event.target.value as BillingStatus }))
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
              value={form.googleReviewLink}
              onChange={(event) => onFormChange((current) => ({ ...current, googleReviewLink: event.target.value }))}
            />
          </label>

          <div className="inline-grid">
            <label className="field">
              <span>Nombre acceso</span>
              <input
                autoComplete="off"
                value={form.ownerName}
                onChange={(event) => onFormChange((current) => ({ ...current, ownerName: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Email acceso</span>
              <input
                type="email"
                autoComplete="off"
                value={form.ownerEmail}
                onChange={(event) => onFormChange((current) => ({ ...current, ownerEmail: event.target.value }))}
              />
            </label>
          </div>

          <label className="field">
            <span>Password inicial</span>
            <input
              type="password"
              autoComplete="new-password"
              value={form.ownerPassword}
              onChange={(event) => onFormChange((current) => ({ ...current, ownerPassword: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Notas internas</span>
            <textarea value={form.notes} onChange={(event) => onFormChange((current) => ({ ...current, notes: event.target.value }))} />
          </label>

          <button className="primary" type="submit">
            Crear cliente
          </button>
        </form>
      </section>

      <section className="surface-card dashboard-span-5">
        <div className="section-head">
          <div>
            <p className="eyebrow">Clientes</p>
            <h3>Negocios activos</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onRefresh}>
            Actualizar
          </button>
        </div>

        <div className="client-list">
          {loading ? (
            <div className="empty-card">Cargando clientes...</div>
          ) : clients.length ? (
            clients.map((client) => (
              <article key={client.business.id} className="client-card">
                <div>
                  <strong>{client.business.name}</strong>
                  <span>{client.business.email}</span>
                </div>
                <div className="client-meta">
                  <span>{planLabel[client.business.plan]}</span>
                  <span>{billingLabel[client.business.billingStatus]}</span>
                  <span>{moneyLabel(client.business.planPriceMonthly)}</span>
                </div>
                <div className="client-users">
                  {client.users.map((user) => (
                    <span key={user.id}>{user.email}</span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <EmptyState icon="business_center" title="Sin clientes" detail="Crea el primer negocio desde el formulario." />
          )}
        </div>
      </section>
    </section>
  );
}
