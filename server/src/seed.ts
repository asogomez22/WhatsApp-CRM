import { AppDatabase } from "./types.js";

const now = new Date();
const todayIso = now.toISOString().slice(0, 10);

const atTime = (date: string, hours: number, minutes: number) => {
  const iso = new Date(`${date}T00:00:00.000Z`);
  iso.setUTCHours(hours, minutes, 0, 0);
  return iso.toISOString();
};

export const createSeedData = (): AppDatabase => ({
  businesses: [
    {
      id: "biz-dental-reus",
      name: "Clínica Sonrisa Reus",
      email: "hola@sonrisareus.es",
      phone: "+34977111222",
      city: "Reus",
      plan: "full_pack",
      googleReviewLink: "https://g.page/r/clinica-sonrisa-review",
      active: true,
      createdAt: now.toISOString(),
      googleCalendarConnected: false,
      googleCalendarId: "primary"
    }
  ],
  whatsappChannels: [
    {
      id: "wa-dental-reus",
      businessId: "biz-dental-reus",
      phoneE164: "+34600000001",
      phoneNumberId: "meta-phone-number-id-demo",
      wabaId: "waba-demo",
      accessTokenEncrypted: "demo-token",
      verifyToken: "verify-demo-token",
      displayName: "Clínica Sonrisa Reus",
      templatesReady: true,
      active: true,
      createdAt: now.toISOString()
    }
  ],
  contacts: [
    {
      id: "contact-ana",
      businessId: "biz-dental-reus",
      name: "Ana Pérez",
      phone: "+34611122334",
      tags: ["reseña", "seguimiento"],
      createdAt: now.toISOString(),
      lastInteractionAt: now.toISOString()
    },
    {
      id: "contact-luis",
      businessId: "biz-dental-reus",
      name: "Luis Martín",
      phone: "+34622233445",
      tags: ["nuevo"],
      createdAt: now.toISOString(),
      lastInteractionAt: now.toISOString()
    }
  ],
  services: [
    {
      id: "service-first-visit",
      businessId: "biz-dental-reus",
      name: "Primera visita",
      durationMinutes: 30,
      active: true
    },
    {
      id: "service-cleaning",
      businessId: "biz-dental-reus",
      name: "Limpieza dental",
      durationMinutes: 45,
      active: true
    },
    {
      id: "service-review",
      businessId: "biz-dental-reus",
      name: "Revisión",
      durationMinutes: 20,
      active: true
    }
  ],
  availabilityRules: [
    { id: "avail-1", businessId: "biz-dental-reus", weekday: 1, start: "09:00", end: "14:00" },
    { id: "avail-2", businessId: "biz-dental-reus", weekday: 1, start: "16:00", end: "19:00" },
    { id: "avail-3", businessId: "biz-dental-reus", weekday: 2, start: "09:00", end: "14:00" },
    { id: "avail-4", businessId: "biz-dental-reus", weekday: 3, start: "09:00", end: "14:00" },
    { id: "avail-5", businessId: "biz-dental-reus", weekday: 4, start: "09:00", end: "14:00" },
    { id: "avail-6", businessId: "biz-dental-reus", weekday: 5, start: "09:00", end: "14:00" }
  ],
  appointments: [
    {
      id: "appt-1",
      businessId: "biz-dental-reus",
      contactId: "contact-ana",
      serviceId: "service-cleaning",
      startAt: atTime(todayIso, 10, 0),
      endAt: atTime(todayIso, 10, 45),
      status: "scheduled",
      source: "manual",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      id: "appt-2",
      businessId: "biz-dental-reus",
      contactId: "contact-luis",
      serviceId: "service-first-visit",
      startAt: atTime(todayIso, 12, 0),
      endAt: atTime(todayIso, 12, 30),
      status: "confirmed",
      source: "whatsapp",
      reminderSentAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ],
  messages: [
    {
      id: "msg-1",
      businessId: "biz-dental-reus",
      contactId: "contact-luis",
      direction: "outgoing",
      kind: "confirmation",
      body: "Tu cita ha quedado confirmada para hoy a las 12:00.",
      appointmentId: "appt-2",
      createdAt: now.toISOString()
    }
  ],
  conversationStates: []
});
