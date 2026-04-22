import { calendar_v3, google } from "googleapis";
import { Appointment, Business, Contact, Service } from "../types.js";

const hasServiceAccountConfig =
  Boolean(process.env.GOOGLE_CLIENT_EMAIL) &&
  Boolean(process.env.GOOGLE_PRIVATE_KEY) &&
  Boolean(process.env.GOOGLE_PROJECT_ID);

export class GoogleCalendarService {
  private getClient() {
    if (!hasServiceAccountConfig) {
      return undefined;
    }

    return new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });
  }

  isReady() {
    return hasServiceAccountConfig;
  }

  buildEvent(appointment: Appointment, business: Business, contact: Contact, service: Service): calendar_v3.Schema$Event {
    return {
      summary: `${service.name} · ${contact.name}`,
      description: `Creada desde WhatsApp CRM para ${business.name}`,
      start: { dateTime: appointment.startAt },
      end: { dateTime: appointment.endAt },
      attendees: contact.phone ? [{ displayName: contact.name, comment: contact.phone }] : undefined
    };
  }

  async syncAppointment(params: {
    appointment: Appointment;
    business: Business;
    contact: Contact;
    service: Service;
  }) {
    const { appointment, business, contact, service } = params;
    const event = this.buildEvent(appointment, business, contact, service);

    if (!business.googleCalendarConnected || !business.googleCalendarId || !this.isReady()) {
      return {
        synced: false,
        reason: "Google Calendar no configurado aún"
      };
    }

    const auth = this.getClient();
    if (!auth) {
      return {
        synced: false,
        reason: "Credenciales de servicio ausentes"
      };
    }

    const calendar = google.calendar({ version: "v3", auth });
    const result = await calendar.events.insert({
      calendarId: business.googleCalendarId,
      requestBody: event
    });

    return {
      synced: true,
      eventId: result.data.id
    };
  }
}
