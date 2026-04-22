import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  AppDatabase,
  Appointment,
  AppUser,
  AvailabilityRule,
  Business,
  Contact,
  DashboardSummary,
  OnboardingChecklistItem,
  ConversationState,
  MessageLog,
  Service,
  WhatsappChannel
} from "./types.js";
import { createSeedData } from "./seed.js";

const DEFAULT_DB_PATH = fileURLToPath(new URL("../data/app-db.json", import.meta.url));
const APP_STATE_KEY = "primary";
const planPriceMap = {
  reviews: 39,
  anti_no_show: 49,
  auto_appointments: 79,
  full_pack: 99
} as const;

const clone = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

export class DataStore {
  private db?: AppDatabase;
  private readonly dbPath: string;
  private readonly mode: "json-file" | "postgres";
  private readonly pool?: Pool;
  private readonly readyPromise: Promise<void>;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      const shouldUseSsl = process.env.PGSSL === "true" || databaseUrl.includes("supabase");
      this.pool = new Pool({
        connectionString: databaseUrl,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
      });
      this.dbPath = "";
      this.mode = "postgres";
      this.readyPromise = this.bootstrapPostgres();
      return;
    }

    this.mode = "json-file";
    this.dbPath = process.env.DB_FILE_PATH
      ? resolve(process.env.DB_FILE_PATH)
      : process.env.DATA_DIR
        ? resolve(process.env.DATA_DIR, "app-db.json")
        : DEFAULT_DB_PATH;

    mkdirSync(dirname(this.dbPath), { recursive: true });

    if (!existsSync(this.dbPath)) {
      const seed = createSeedData();
      writeFileSync(this.dbPath, JSON.stringify(seed, null, 2));
      this.db = seed;
    } else {
      const raw = JSON.parse(readFileSync(this.dbPath, "utf8")) as Partial<AppDatabase>;
      this.db = this.normalizeDb(raw);
      writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
    }

    this.readyPromise = Promise.resolve();
  }

  getStorageMode() {
    return this.mode;
  }

  async close() {
    await this.pool?.end();
  }

  async ready() {
    await this.readyPromise;
  }

  private async bootstrapPostgres() {
    if (!this.pool) {
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await this.pool.query("SELECT payload FROM app_state WHERE id = $1", [APP_STATE_KEY]);
    if (!existing.rowCount) {
      await this.pool.query("INSERT INTO app_state (id, payload) VALUES ($1, $2::jsonb)", [
        APP_STATE_KEY,
        JSON.stringify(createSeedData())
      ]);
    }
  }

  private async ensureReady() {
    await this.readyPromise;
  }

  private async loadDb() {
    await this.ensureReady();

    if (this.mode === "json-file") {
      return this.normalizeDb(this.db as AppDatabase);
    }

    const result = await this.pool?.query("SELECT payload FROM app_state WHERE id = $1", [APP_STATE_KEY]);
    return this.normalizeDb((result?.rows[0]?.payload ?? createSeedData()) as Partial<AppDatabase>);
  }

  private async persist(db: AppDatabase) {
    const normalized = this.normalizeDb(db);

    if (this.mode === "json-file") {
      this.db = normalized;
      writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
      return;
    }

    await this.pool?.query("UPDATE app_state SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1", [
      APP_STATE_KEY,
      JSON.stringify(normalized)
    ]);
  }

  private normalizeDb(input: Partial<AppDatabase>) {
    const nowIso = new Date().toISOString();

    return {
      businesses: (input.businesses ?? []).map((business) => ({
        ...business,
        timezone: business.timezone ?? "Europe/Madrid",
        notes: business.notes ?? "",
        planPriceMonthly: business.planPriceMonthly ?? planPriceMap[business.plan] ?? planPriceMap.reviews,
        billingStatus: business.billingStatus ?? "unconfigured",
        active: business.active ?? true,
        updatedAt: business.updatedAt ?? business.createdAt ?? nowIso
      })),
      whatsappChannels: (input.whatsappChannels ?? []).map((channel) => ({
        ...channel,
        templateNames: channel.templateNames ?? [],
        templatesReady: channel.templatesReady ?? false,
        metaVerified: channel.metaVerified ?? false,
        active: channel.active ?? true,
        updatedAt: channel.updatedAt ?? channel.createdAt ?? nowIso
      })),
      users: (input.users ?? []).map((user) => ({
        ...user,
        businessIds: user.businessIds ?? [],
        active: user.active ?? true,
        updatedAt: user.updatedAt ?? user.createdAt ?? nowIso
      })),
      contacts: (input.contacts ?? []).map((contact) => ({
        ...contact,
        email: contact.email ?? undefined,
        notes: contact.notes ?? "",
        tags: contact.tags ?? [],
        updatedAt: contact.updatedAt ?? contact.createdAt ?? nowIso
      })),
      services: (input.services ?? []).map((service) => ({
        ...service,
        active: service.active ?? true
      })),
      availabilityRules: input.availabilityRules ?? [],
      appointments: (input.appointments ?? []).map((appointment) => ({
        ...appointment,
        source: appointment.source ?? "manual",
        updatedAt: appointment.updatedAt ?? appointment.createdAt ?? nowIso
      })),
      messages: input.messages ?? [],
      conversationStates: input.conversationStates ?? []
    } satisfies AppDatabase;
  }

  private async read<T>(reader: (db: AppDatabase) => T) {
    const db = await this.loadDb();
    return clone(reader(db));
  }

  private async mutate<T>(writer: (db: AppDatabase) => T) {
    const db = await this.loadDb();
    const result = writer(db);
    await this.persist(db);
    return clone(result);
  }

  private buildOnboardingChecklist(db: AppDatabase, businessId: string): OnboardingChecklistItem[] {
    const business = db.businesses.find((item) => item.id === businessId);
    const channel = db.whatsappChannels.find((item) => item.businessId === businessId);
    const services = db.services.filter((item) => item.businessId === businessId && item.active);
    const availabilityRules = db.availabilityRules.filter((item) => item.businessId === businessId);
    const users = db.users.filter((item) => item.businessIds.includes(businessId) && item.active);

    if (!business) {
      return [];
    }

    return [
      {
        id: "business_profile",
        label: "Perfil del negocio",
        description: "Nombre, email, telefono y ciudad configurados.",
        status: business.name && business.email && business.phone && business.city ? "done" : "pending"
      },
      {
        id: "review_link",
        label: "Enlace de resenas",
        description: "El negocio tiene URL de Google Review configurada.",
        status: business.googleReviewLink ? "done" : "pending"
      },
      {
        id: "whatsapp_channel",
        label: "Canal de WhatsApp",
        description: "Numero dedicado, phone_number_id y verify token conectados.",
        status: channel?.phoneE164 && channel.phoneNumberId && channel.verifyToken ? "done" : "pending"
      },
      {
        id: "meta_verified",
        label: "Canal verificado",
        description: "Meta y el numero estan listos para trafico real.",
        status: channel?.metaVerified ? "done" : "pending"
      },
      {
        id: "templates",
        label: "Plantillas aprobadas",
        description: "Las plantillas necesarias ya estan marcadas como listas.",
        status: channel?.templatesReady ? "done" : "pending"
      },
      {
        id: "services",
        label: "Servicios",
        description: "Hay servicios activos para poder reservar por WhatsApp.",
        status: services.length ? "done" : "pending"
      },
      {
        id: "availability",
        label: "Disponibilidad",
        description: "Reglas de agenda creadas para ofrecer huecos reales.",
        status: availabilityRules.length ? "done" : "pending"
      },
      {
        id: "team",
        label: "Equipo",
        description: "Existe al menos un usuario administrador del negocio.",
        status: users.some((item) => item.role === "business_admin" || item.role === "platform_admin") ? "done" : "pending"
      },
      {
        id: "billing",
        label: "Billing",
        description: "Stripe o estado de cobro configurado para este negocio.",
        status: business.billingStatus === "active" || business.billingStatus === "trial" ? "done" : "pending"
      }
    ];
  }

  async hasUsers() {
    return this.read((db) => db.users.length > 0);
  }

  async getUsers() {
    return this.read((db) => db.users);
  }

  async getUserById(userId: string) {
    return this.read((db) => db.users.find((user) => user.id === userId));
  }

  async findUserByEmail(email: string) {
    return this.read((db) => db.users.find((user) => user.email.toLowerCase() === email.toLowerCase()));
  }

  async createUser(input: Omit<AppUser, "id" | "createdAt" | "updatedAt">) {
    return this.mutate((db) => {
      const user: AppUser = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.users.push(user);
      return user;
    });
  }

  async updateUser(userId: string, patch: Partial<AppUser>) {
    return this.mutate((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) {
        return undefined;
      }

      Object.assign(user, patch, { updatedAt: new Date().toISOString() });
      return user;
    });
  }

  async getBusinesses() {
    return this.read((db) => db.businesses);
  }

  async getBusiness(businessId: string) {
    return this.read((db) => db.businesses.find((business) => business.id === businessId));
  }

  async getBusinessesForUser(user: Pick<AppUser, "role" | "businessIds">) {
    return this.read((db) => {
      if (user.role === "platform_admin") {
        return db.businesses;
      }

      return db.businesses.filter((business) => user.businessIds.includes(business.id));
    });
  }

  async createBusiness(input: Omit<Business, "id" | "createdAt" | "updatedAt">) {
    return this.mutate((db) => {
      const business: Business = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.businesses.push(business);
      return business;
    });
  }

  async updateBusiness(businessId: string, patch: Partial<Business>) {
    return this.mutate((db) => {
      const business = db.businesses.find((item) => item.id === businessId);
      if (!business) {
        return undefined;
      }

      Object.assign(business, patch, { updatedAt: new Date().toISOString() });
      return business;
    });
  }

  async addBusinessAccess(userId: string, businessId: string) {
    return this.mutate((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) {
        return undefined;
      }

      if (!user.businessIds.includes(businessId)) {
        user.businessIds.push(businessId);
        user.updatedAt = new Date().toISOString();
      }

      return user;
    });
  }

  async getWhatsappChannelByBusinessId(businessId: string) {
    return this.read((db) => db.whatsappChannels.find((channel) => channel.businessId === businessId));
  }

  async getWhatsappChannelByPhoneNumberId(phoneNumberId: string) {
    return this.read((db) => db.whatsappChannels.find((channel) => channel.phoneNumberId === phoneNumberId));
  }

  async upsertWhatsappChannel(input: Omit<WhatsappChannel, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    return this.mutate((db) => {
      const existing = db.whatsappChannels.find((channel) => channel.businessId === input.businessId);
      if (existing) {
        Object.assign(existing, input, { updatedAt: new Date().toISOString() });
        return existing;
      }

      const channel: WhatsappChannel = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.whatsappChannels.push(channel);
      return channel;
    });
  }

  async getContacts(businessId: string) {
    return this.read((db) => db.contacts.filter((contact) => contact.businessId === businessId));
  }

  async getContact(contactId: string) {
    return this.read((db) => db.contacts.find((contact) => contact.id === contactId));
  }

  async findContactByPhone(businessId: string, phone: string) {
    return this.read((db) => db.contacts.find((contact) => contact.businessId === businessId && contact.phone === phone));
  }

  async createContact(input: Omit<Contact, "id" | "createdAt" | "updatedAt">) {
    return this.mutate((db) => {
      const contact: Contact = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.contacts.push(contact);
      return contact;
    });
  }

  async updateContact(contactId: string, patch: Partial<Contact>) {
    return this.mutate((db) => {
      const contact = db.contacts.find((item) => item.id === contactId);
      if (!contact) {
        return undefined;
      }

      Object.assign(contact, patch, {
        updatedAt: new Date().toISOString()
      });
      return contact;
    });
  }

  async touchContact(contactId: string) {
    return this.updateContact(contactId, { lastInteractionAt: new Date().toISOString() });
  }

  async getServices(businessId: string) {
    return this.read((db) => db.services.filter((service) => service.businessId === businessId && service.active));
  }

  async getService(serviceId: string) {
    return this.read((db) => db.services.find((service) => service.id === serviceId));
  }

  async createService(input: Omit<Service, "id">) {
    return this.mutate((db) => {
      const service: Service = {
        ...input,
        id: crypto.randomUUID()
      };

      db.services.push(service);
      return service;
    });
  }

  async getAvailabilityRules(businessId: string) {
    return this.read((db) => db.availabilityRules.filter((rule) => rule.businessId === businessId));
  }

  async replaceAvailabilityRules(businessId: string, rules: Omit<AvailabilityRule, "id" | "businessId">[]) {
    return this.mutate((db) => {
      db.availabilityRules = db.availabilityRules.filter((rule) => rule.businessId !== businessId);
      const nextRules = rules.map((rule) => ({
        ...rule,
        businessId,
        id: crypto.randomUUID()
      }));

      db.availabilityRules.push(...nextRules);
      return nextRules;
    });
  }

  async getAppointments(businessId: string, date?: string) {
    return this.read((db) =>
      db.appointments.filter((appointment) => {
        if (appointment.businessId !== businessId) {
          return false;
        }

        if (!date) {
          return true;
        }

        return appointment.startAt.slice(0, 10) === date;
      })
    );
  }

  async getAppointment(appointmentId: string) {
    return this.read((db) => db.appointments.find((appointment) => appointment.id === appointmentId));
  }

  async createAppointment(input: Omit<Appointment, "id" | "createdAt" | "updatedAt">) {
    return this.mutate((db) => {
      const appointment: Appointment = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.appointments.push(appointment);
      return appointment;
    });
  }

  async updateAppointment(appointmentId: string, patch: Partial<Appointment>) {
    return this.mutate((db) => {
      const appointment = db.appointments.find((item) => item.id === appointmentId);
      if (!appointment) {
        return undefined;
      }

      const nextPatch = { ...patch };
      if (nextPatch.status === "completed" && !appointment.completedAt) {
        nextPatch.completedAt = new Date().toISOString();
      }

      if (nextPatch.status === "cancelled" && !appointment.cancelledAt) {
        nextPatch.cancelledAt = new Date().toISOString();
      }

      Object.assign(appointment, nextPatch, { updatedAt: new Date().toISOString() });
      return appointment;
    });
  }

  async getMessages(businessId: string, limit = 20) {
    return this.read((db) =>
      db.messages
        .filter((message) => message.businessId === businessId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    );
  }

  async logMessage(input: Omit<MessageLog, "id" | "createdAt">) {
    return this.mutate((db) => {
      const message: MessageLog = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };

      db.messages.push(message);
      return message;
    });
  }

  async getConversationState(businessId: string, contactId: string) {
    return this.read((db) =>
      db.conversationStates.find((state) => state.businessId === businessId && state.contactId === contactId)
    );
  }

  async setConversationState(input: Omit<ConversationState, "id" | "updatedAt"> & { id?: string }) {
    return this.mutate((db) => {
      const existing = db.conversationStates.find(
        (state) => state.businessId === input.businessId && state.contactId === input.contactId
      );

      if (existing) {
        Object.assign(existing, input, { updatedAt: new Date().toISOString() });
        return existing;
      }

      const state: ConversationState = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      };

      db.conversationStates.push(state);
      return state;
    });
  }

  async clearConversationState(businessId: string, contactId: string) {
    await this.mutate((db) => {
      db.conversationStates = db.conversationStates.filter(
        (state) => !(state.businessId === businessId && state.contactId === contactId)
      );

      return true;
    });
  }

  async getDashboardSummary(businessId: string, date: string): Promise<DashboardSummary | undefined> {
    return this.read((db) => {
      const business = db.businesses.find((item) => item.id === businessId);
      if (!business) {
        return undefined;
      }

      const appointments = db.appointments
        .filter((appointment) => appointment.businessId === businessId && appointment.startAt.slice(0, 10) === date)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
      const allBusinessAppointments = db.appointments.filter((appointment) => appointment.businessId === businessId);
      const contacts = db.contacts.filter((contact) => contact.businessId === businessId);
      const services = db.services.filter((service) => service.businessId === businessId && service.active);
      const availabilityRules = db.availabilityRules.filter((rule) => rule.businessId === businessId);
      const recentMessages = db.messages
        .filter((message) => message.businessId === businessId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12);
      const channel = db.whatsappChannels.find((item) => item.businessId === businessId);
      const users = db.users
        .filter((item) => item.businessIds.includes(businessId) && item.active)
        .map((item) => ({
          id: item.id,
          email: item.email,
          name: item.name,
          role: item.role,
          lastLoginAt: item.lastLoginAt
        }));
      const checklist = this.buildOnboardingChecklist(db, businessId);
      const completedChecklist = checklist.filter((item) => item.status === "done").length;
      const confirmedAppointments = allBusinessAppointments.filter((appointment) => appointment.status === "confirmed").length;

      return {
        business: clone(business),
        metrics: {
          todayAppointments: appointments.length,
          pendingConfirmations: appointments.filter((appointment) => appointment.status === "scheduled").length,
          completedAppointments: appointments.filter((appointment) => appointment.status === "completed").length,
          noShows: appointments.filter((appointment) => appointment.status === "no_show").length,
          reviewsPending: allBusinessAppointments.filter(
            (appointment) => appointment.status === "completed" && !appointment.reviewRequestedAt
          ).length,
          whatsappOpenFlows: db.conversationStates.filter((state) => state.businessId === businessId).length,
          leadsTracked: contacts.filter((contact) => contact.tags.includes("lead") || contact.tags.includes("nuevo")).length,
          confirmedRate: allBusinessAppointments.length
            ? Math.round((confirmedAppointments / allBusinessAppointments.length) * 100)
            : 0
        },
        appointments,
        contacts,
        services,
        availabilityRules,
        recentMessages,
        channel: channel ? clone(channel) : undefined,
        users,
        onboarding: {
          completed: completedChecklist,
          total: checklist.length,
          completionRatio: checklist.length ? Math.round((completedChecklist / checklist.length) * 100) : 0,
          items: checklist
        },
        billing: {
          status: business.billingStatus,
          checkoutConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
          customerId: business.stripeCustomerId,
          subscriptionId: business.stripeSubscriptionId
        },
        automation: {
          reviewsReady: Boolean(channel && business.googleReviewLink),
          remindersReady: availabilityRules.length > 0,
          autoBookingReady: Boolean(channel && services.length && availabilityRules.length),
          handoffReady: users.length > 0
        }
      };
    });
  }
}
