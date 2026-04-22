import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AppDatabase, Appointment, AvailabilityRule, Business, Contact, ConversationState, DashboardSummary, MessageLog, Service, WhatsappChannel } from "./types.js";
import { createSeedData } from "./seed.js";

const DEFAULT_DB_PATH = new URL("../data/app-db.json", import.meta.url);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class DataStore {
  private db: AppDatabase;
  private readonly dbPath: string;

  constructor() {
    this.dbPath = process.env.DB_FILE_PATH
      ? resolve(process.env.DB_FILE_PATH)
      : process.env.DATA_DIR
        ? resolve(process.env.DATA_DIR, "app-db.json")
        : DEFAULT_DB_PATH.pathname;

    mkdirSync(dirname(this.dbPath), { recursive: true });

    if (!existsSync(this.dbPath)) {
      const seed = createSeedData();
      writeFileSync(this.dbPath, JSON.stringify(seed, null, 2));
      this.db = seed;
      return;
    }

    this.db = JSON.parse(readFileSync(this.dbPath, "utf8")) as AppDatabase;
  }

  private persist() {
    writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  getBusinesses() {
    return clone(this.db.businesses);
  }

  getBusiness(businessId: string) {
    return this.db.businesses.find((business) => business.id === businessId);
  }

  createBusiness(input: Omit<Business, "id" | "createdAt">) {
    const business: Business = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };

    this.db.businesses.push(business);
    this.persist();
    return clone(business);
  }

  updateBusiness(businessId: string, patch: Partial<Business>) {
    const business = this.getBusiness(businessId);
    if (!business) {
      return undefined;
    }

    Object.assign(business, patch);
    this.persist();
    return clone(business);
  }

  getWhatsappChannelByBusinessId(businessId: string) {
    return this.db.whatsappChannels.find((channel) => channel.businessId === businessId);
  }

  getWhatsappChannelByPhoneNumberId(phoneNumberId: string) {
    return this.db.whatsappChannels.find((channel) => channel.phoneNumberId === phoneNumberId);
  }

  upsertWhatsappChannel(input: Omit<WhatsappChannel, "id" | "createdAt"> & { id?: string }) {
    const existing = this.getWhatsappChannelByBusinessId(input.businessId);
    if (existing) {
      Object.assign(existing, input);
      this.persist();
      return clone(existing);
    }

    const channel: WhatsappChannel = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.db.whatsappChannels.push(channel);
    this.persist();
    return clone(channel);
  }

  getContacts(businessId: string) {
    return clone(this.db.contacts.filter((contact) => contact.businessId === businessId));
  }

  getContact(contactId: string) {
    return this.db.contacts.find((contact) => contact.id === contactId);
  }

  findContactByPhone(businessId: string, phone: string) {
    return this.db.contacts.find((contact) => contact.businessId === businessId && contact.phone === phone);
  }

  createContact(input: Omit<Contact, "id" | "createdAt">) {
    const contact: Contact = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.db.contacts.push(contact);
    this.persist();
    return clone(contact);
  }

  touchContact(contactId: string) {
    const contact = this.getContact(contactId);
    if (!contact) {
      return undefined;
    }
    contact.lastInteractionAt = new Date().toISOString();
    this.persist();
    return clone(contact);
  }

  getServices(businessId: string) {
    return clone(this.db.services.filter((service) => service.businessId === businessId && service.active));
  }

  getService(serviceId: string) {
    return this.db.services.find((service) => service.id === serviceId);
  }

  createService(input: Omit<Service, "id">) {
    const service: Service = {
      ...input,
      id: crypto.randomUUID()
    };
    this.db.services.push(service);
    this.persist();
    return clone(service);
  }

  getAvailabilityRules(businessId: string) {
    return clone(this.db.availabilityRules.filter((rule) => rule.businessId === businessId));
  }

  replaceAvailabilityRules(businessId: string, rules: Omit<AvailabilityRule, "id" | "businessId">[]) {
    this.db.availabilityRules = this.db.availabilityRules.filter((rule) => rule.businessId !== businessId);
    const nextRules = rules.map((rule) => ({
      ...rule,
      businessId,
      id: crypto.randomUUID()
    }));
    this.db.availabilityRules.push(...nextRules);
    this.persist();
    return clone(nextRules);
  }

  getAppointments(businessId: string, date?: string) {
    return clone(
      this.db.appointments.filter((appointment) => {
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

  getAppointment(appointmentId: string) {
    return this.db.appointments.find((appointment) => appointment.id === appointmentId);
  }

  createAppointment(input: Omit<Appointment, "id" | "createdAt" | "updatedAt">) {
    const appointment: Appointment = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.db.appointments.push(appointment);
    this.persist();
    return clone(appointment);
  }

  updateAppointment(appointmentId: string, patch: Partial<Appointment>) {
    const appointment = this.getAppointment(appointmentId);
    if (!appointment) {
      return undefined;
    }

    Object.assign(appointment, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return clone(appointment);
  }

  getMessages(businessId: string, limit = 20) {
    return clone(
      this.db.messages
        .filter((message) => message.businessId === businessId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    );
  }

  logMessage(input: Omit<MessageLog, "id" | "createdAt">) {
    const message: MessageLog = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.db.messages.push(message);
    this.persist();
    return clone(message);
  }

  getConversationState(businessId: string, contactId: string) {
    return this.db.conversationStates.find((state) => state.businessId === businessId && state.contactId === contactId);
  }

  setConversationState(input: Omit<ConversationState, "id" | "updatedAt"> & { id?: string }) {
    const existing = this.getConversationState(input.businessId, input.contactId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date().toISOString() });
      this.persist();
      return clone(existing);
    }

    const state: ConversationState = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };
    this.db.conversationStates.push(state);
    this.persist();
    return clone(state);
  }

  clearConversationState(businessId: string, contactId: string) {
    const before = this.db.conversationStates.length;
    this.db.conversationStates = this.db.conversationStates.filter(
      (state) => !(state.businessId === businessId && state.contactId === contactId)
    );
    if (this.db.conversationStates.length !== before) {
      this.persist();
    }
  }

  getDashboardSummary(businessId: string, date: string): DashboardSummary | undefined {
    const business = this.getBusiness(businessId);
    if (!business) {
      return undefined;
    }

    const appointments = this.getAppointments(businessId, date).sort((a, b) => a.startAt.localeCompare(b.startAt));
    const contacts = this.getContacts(businessId);
    const services = this.getServices(businessId);
    const availabilityRules = this.getAvailabilityRules(businessId);
    const recentMessages = this.getMessages(businessId, 12);
    const channel = this.getWhatsappChannelByBusinessId(businessId);

    return {
      business: clone(business),
      metrics: {
        todayAppointments: appointments.length,
        pendingConfirmations: appointments.filter((appointment) => appointment.status === "scheduled").length,
        completedAppointments: appointments.filter((appointment) => appointment.status === "completed").length,
        noShows: appointments.filter((appointment) => appointment.status === "no_show").length,
        reviewsPending: appointments.filter((appointment) => appointment.status === "completed" && !appointment.reviewRequestedAt).length,
        whatsappOpenFlows: this.db.conversationStates.filter((state) => state.businessId === businessId).length
      },
      appointments,
      contacts,
      services,
      availabilityRules,
      recentMessages,
      channel: channel ? clone(channel) : undefined
    };
  }
}
