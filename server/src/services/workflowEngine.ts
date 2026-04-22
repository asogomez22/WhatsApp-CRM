import { DataStore } from "../dataStore.js";
import { WhatsappService } from "./whatsappService.js";
import { Appointment, Contact, Service } from "../types.js";

const formatLocal = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(iso));

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const fromMinutes = (date: string, minutes: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMinutes(minutes);
  return value.toISOString();
};

export class WorkflowEngine {
  constructor(
    private readonly store: DataStore,
    private readonly whatsapp: WhatsappService
  ) {}

  private async sendAndLog(params: {
    businessId: string;
    contact: Contact;
    body: string;
    kind: "review_request" | "reminder" | "confirmation" | "assistant" | "human_handoff";
    appointmentId?: string;
  }) {
    const channel = this.store.getWhatsappChannelByBusinessId(params.businessId);
    if (!channel) {
      throw new Error("El negocio no tiene canal de WhatsApp configurado");
    }

    await this.whatsapp.sendMessage({
      channel,
      contact: params.contact,
      body: params.body,
      kind: params.kind
    });

    this.store.logMessage({
      businessId: params.businessId,
      contactId: params.contact.id,
      direction: "outgoing",
      kind: params.kind,
      body: params.body,
      appointmentId: params.appointmentId
    });
  }

  private matchService(message: string, services: Service[]) {
    const normalized = message.trim().toLowerCase();
    const numericChoice = Number(normalized);

    if (!Number.isNaN(numericChoice) && numericChoice >= 1 && numericChoice <= services.length) {
      return services[numericChoice - 1];
    }

    return services.find((service) => normalized.includes(service.name.toLowerCase()));
  }

  private getNextDateForWeekday(base: Date, weekday: number) {
    const result = new Date(base);
    const distance = (weekday - result.getUTCDay() + 7) % 7;
    result.setUTCDate(result.getUTCDate() + distance);
    return result;
  }

  getAvailableSlots(businessId: string, serviceId: string, limit = 3) {
    const service = this.store.getService(serviceId);
    if (!service) {
      return [];
    }

    const rules = this.store.getAvailabilityRules(businessId);
    const appointments = this.store
      .getAppointments(businessId)
      .filter((appointment) => !["cancelled", "no_show"].includes(appointment.status));

    const slots: string[] = [];
    const today = new Date();

    for (let offset = 0; offset < 14 && slots.length < limit; offset += 1) {
      const cursor = new Date(today);
      cursor.setUTCDate(today.getUTCDate() + offset);
      const weekday = cursor.getUTCDay();
      const date = cursor.toISOString().slice(0, 10);

      for (const rule of rules.filter((value) => value.weekday === weekday)) {
        let current = toMinutes(rule.start);
        const end = toMinutes(rule.end);

        while (current + service.durationMinutes <= end && slots.length < limit) {
          const candidateStart = fromMinutes(date, current);
          const candidateEnd = fromMinutes(date, current + service.durationMinutes);

          const overlaps = appointments.some((appointment) => {
            if (appointment.startAt.slice(0, 10) !== date) {
              return false;
            }

            return appointment.startAt < candidateEnd && appointment.endAt > candidateStart;
          });

          if (!overlaps && new Date(candidateStart) > today) {
            slots.push(candidateStart);
          }

          current += service.durationMinutes;
        }
      }
    }

    return slots;
  }

  async processDueAutomations(now = new Date()) {
    const allBusinesses = this.store.getBusinesses().filter((business) => business.active);

    for (const business of allBusinesses) {
      const appointments = this.store.getAppointments(business.id);

      for (const appointment of appointments) {
        const contact = this.store.getContact(appointment.contactId);
        const service = this.store.getService(appointment.serviceId);
        if (!contact || !service) {
          continue;
        }

        const start = new Date(appointment.startAt).getTime();
        const end = new Date(appointment.endAt).getTime();
        const current = now.getTime();

        if (
          ["scheduled", "confirmed"].includes(appointment.status) &&
          !appointment.reminderSentAt &&
          start - current <= 24 * 60 * 60 * 1000 &&
          start - current > 0
        ) {
          await this.sendAndLog({
            businessId: business.id,
            contact,
            body: `Recordatorio: tienes ${service.name} el ${formatLocal(appointment.startAt)}. Responde CONFIRMAR o CANCELAR.`,
            kind: "reminder",
            appointmentId: appointment.id
          });
          this.store.updateAppointment(appointment.id, { reminderSentAt: now.toISOString() });
        }

        if (appointment.status === "completed" && !appointment.reviewRequestedAt && current - end >= 2 * 60 * 60 * 1000) {
          await this.sendAndLog({
            businessId: business.id,
            contact,
            body: `Gracias por tu visita a ${business.name}. ¿Nos dejas una reseña? ${business.googleReviewLink}`,
            kind: "review_request",
            appointmentId: appointment.id
          });
          this.store.updateAppointment(appointment.id, { reviewRequestedAt: now.toISOString() });
        }
      }
    }
  }

  async handleIncomingMessage(params: {
    businessId: string;
    fromPhone: string;
    text: string;
  }) {
    const { businessId, fromPhone, text } = params;
    const business = this.store.getBusiness(businessId);
    if (!business) {
      throw new Error("Negocio no encontrado");
    }

    let contact = this.store.findContactByPhone(businessId, fromPhone);
    if (!contact) {
      contact = this.store.createContact({
        businessId,
        name: `Paciente ${fromPhone.slice(-4)}`,
        phone: fromPhone,
        tags: ["lead"]
      });
    }

    this.store.touchContact(contact.id);
    this.store.logMessage({
      businessId,
      contactId: contact.id,
      direction: "incoming",
      kind: "assistant",
      body: text
    });

    const normalized = text.trim().toLowerCase();
    const appointments = this.store
      .getAppointments(businessId)
      .filter((appointment) => appointment.contactId === contact.id)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const activeAppointment = appointments.find((appointment) =>
      ["scheduled", "confirmed", "pending"].includes(appointment.status)
    );

    if (["confirmar", "confirmo", "sí", "si"].includes(normalized) && activeAppointment) {
      this.store.updateAppointment(activeAppointment.id, { status: "confirmed" });
      await this.sendAndLog({
        businessId,
        contact,
        body: `Perfecto, tu cita del ${formatLocal(activeAppointment.startAt)} queda confirmada.`,
        kind: "confirmation",
        appointmentId: activeAppointment.id
      });
      return { action: "appointment_confirmed" };
    }

    if (["cancelar", "cancelo"].includes(normalized) && activeAppointment) {
      this.store.updateAppointment(activeAppointment.id, { status: "cancelled" });
      await this.sendAndLog({
        businessId,
        contact,
        body: "Tu cita ha sido cancelada. Si quieres, puedo ofrecerte otra franja.",
        kind: "confirmation",
        appointmentId: activeAppointment.id
      });
      return { action: "appointment_cancelled" };
    }

    const services = this.store.getServices(businessId);
    const flow = this.store.getConversationState(businessId, contact.id);

    if (!flow && /(cita|appointment|reservar|visita|hueco)/i.test(normalized)) {
      this.store.setConversationState({
        businessId,
        contactId: contact.id,
        step: "choose_service"
      });
      const options = services.map((service, index) => `${index + 1}. ${service.name}`).join("\n");
      await this.sendAndLog({
        businessId,
        contact,
        body: `Claro. Indica el servicio respondiendo con el número:\n${options}`,
        kind: "assistant"
      });
      return { action: "service_prompted" };
    }

    if (flow?.step === "choose_service") {
      const service = this.matchService(normalized, services);
      if (!service) {
        await this.sendAndLog({
          businessId,
          contact,
          body: "No he reconocido el servicio. Responde con 1, 2 o 3 según la opción que prefieras.",
          kind: "assistant"
        });
        return { action: "service_retry" };
      }

      const offeredSlots = this.getAvailableSlots(businessId, service.id, 3);
      if (!offeredSlots.length) {
        this.store.setConversationState({
          businessId,
          contactId: contact.id,
          step: "handoff",
          selectedServiceId: service.id
        });
        await this.sendAndLog({
          businessId,
          contact,
          body: "No encuentro huecos automáticos ahora mismo. Te deriva una persona del equipo.",
          kind: "human_handoff"
        });
        return { action: "handoff_no_slots" };
      }

      this.store.setConversationState({
        businessId,
        contactId: contact.id,
        step: "choose_slot",
        selectedServiceId: service.id,
        offeredSlots
      });

      const options = offeredSlots.map((slot, index) => `${index + 1}. ${formatLocal(slot)}`).join("\n");
      await this.sendAndLog({
        businessId,
        contact,
        body: `Estos son los siguientes huecos para ${service.name}:\n${options}\nResponde con 1, 2 o 3.`,
        kind: "assistant"
      });
      return { action: "slot_prompted" };
    }

    if (flow?.step === "choose_slot" && flow.selectedServiceId && flow.offeredSlots?.length) {
      const choice = Number(normalized);
      const slot = Number.isNaN(choice) ? undefined : flow.offeredSlots[choice - 1];
      const service = this.store.getService(flow.selectedServiceId);

      if (!slot || !service) {
        await this.sendAndLog({
          businessId,
          contact,
          body: "No he entendido el hueco elegido. Responde con 1, 2 o 3.",
          kind: "assistant"
        });
        return { action: "slot_retry" };
      }

      const appointment = this.store.createAppointment({
        businessId,
        contactId: contact.id,
        serviceId: service.id,
        startAt: slot,
        endAt: new Date(new Date(slot).getTime() + service.durationMinutes * 60 * 1000).toISOString(),
        status: "confirmed",
        source: "whatsapp"
      });

      this.store.clearConversationState(businessId, contact.id);
      await this.sendAndLog({
        businessId,
        contact,
        body: `Tu cita para ${service.name} queda reservada el ${formatLocal(slot)}.`,
        kind: "confirmation",
        appointmentId: appointment.id
      });
      return { action: "appointment_created", appointmentId: appointment.id };
    }

    await this.sendAndLog({
      businessId,
      contact,
      body: "Puedo ayudarte a pedir cita. Escribe “quiero cita” y te guío paso a paso.",
      kind: "assistant"
    });
    return { action: "fallback_prompted" };
  }
}
