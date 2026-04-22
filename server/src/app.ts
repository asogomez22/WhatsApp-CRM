import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DataStore } from "./dataStore.js";
import { GoogleCalendarService } from "./services/googleCalendarService.js";
import { WhatsappService } from "./services/whatsappService.js";
import { WorkflowEngine } from "./services/workflowEngine.js";

const businessSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  city: z.string().min(2),
  plan: z.enum(["reviews", "anti_no_show", "auto_appointments", "full_pack"]),
  googleReviewLink: z.string().url(),
  active: z.boolean().default(true),
  googleCalendarConnected: z.boolean().default(false),
  googleCalendarId: z.string().optional()
});

const appointmentSchema = z.object({
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  status: z.enum(["pending", "scheduled", "confirmed", "cancelled", "completed", "no_show"]).default("scheduled"),
  source: z.enum(["manual", "whatsapp"]).default("manual"),
  notes: z.string().optional()
});

const appointmentPatchSchema = z.object({
  status: z.enum(["pending", "scheduled", "confirmed", "cancelled", "completed", "no_show"]).optional(),
  notes: z.string().optional()
});

const serviceSchema = z.object({
  name: z.string().min(2),
  durationMinutes: z.number().int().positive(),
  active: z.boolean().default(true)
});

const availabilitySchema = z.object({
  rules: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    })
  )
});

const whatsappChannelSchema = z.object({
  phoneE164: z.string().min(8),
  phoneNumberId: z.string().min(2),
  wabaId: z.string().min(2),
  accessTokenEncrypted: z.string().min(2),
  verifyToken: z.string().min(2),
  displayName: z.string().min(2),
  templatesReady: z.boolean().default(false),
  active: z.boolean().default(true)
});

const googleCalendarSchema = z.object({
  googleCalendarConnected: z.boolean(),
  googleCalendarId: z.string().min(1)
});

export const createApp = () => {
  const app = express();
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const clientDistDir = resolve(serverDir, "../../client/dist");
  const store = new DataStore();
  const googleCalendar = new GoogleCalendarService();
  const whatsapp = new WhatsappService();
  const workflows = new WorkflowEngine(store, whatsapp, googleCalendar);

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      storage: "json-file",
      googleCalendarReady: googleCalendar.isReady()
    });
  });

  app.get("/api/businesses", (_req, res) => {
    res.json(store.getBusinesses());
  });

  app.post("/api/businesses", (req, res) => {
    const parsed = businessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    return res.status(201).json(store.createBusiness(parsed.data));
  });

  app.get("/api/businesses/:businessId/dashboard", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    const dashboard = store.getDashboardSummary(req.params.businessId, date);

    if (!dashboard) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }

    return res.json(dashboard);
  });

  app.get("/api/businesses/:businessId/appointments", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(store.getAppointments(req.params.businessId, date));
  });

  app.post("/api/businesses/:businessId/appointments", async (req, res) => {
    const parsed = appointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const business = store.getBusiness(req.params.businessId);
    const contact = store.getContact(parsed.data.contactId);
    const service = store.getService(parsed.data.serviceId);
    if (!business || !contact || !service) {
      return res.status(404).json({ message: "Negocio, contacto o servicio no encontrado" });
    }

    const appointment = store.createAppointment({
      businessId: req.params.businessId,
      ...parsed.data
    });

    const syncResult = await googleCalendar.syncAppointment({
      appointment,
      business,
      contact,
      service
    });

    if (syncResult.synced && syncResult.eventId) {
      return res.status(201).json(store.updateAppointment(appointment.id, { googleCalendarEventId: syncResult.eventId }));
    }

    return res.status(201).json(appointment);
  });

  app.patch("/api/businesses/:businessId/appointments/:appointmentId", (req, res) => {
    const parsed = appointmentPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const updated = store.updateAppointment(req.params.appointmentId, parsed.data);
    if (!updated || updated.businessId !== req.params.businessId) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }
    return res.json(updated);
  });

  app.get("/api/businesses/:businessId/contacts", (req, res) => {
    res.json(store.getContacts(req.params.businessId));
  });

  app.get("/api/businesses/:businessId/services", (req, res) => {
    res.json(store.getServices(req.params.businessId));
  });

  app.post("/api/businesses/:businessId/services", (req, res) => {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    return res.status(201).json(
      store.createService({
        businessId: req.params.businessId,
        ...parsed.data
      })
    );
  });

  app.get("/api/businesses/:businessId/availability", (req, res) => {
    res.json(store.getAvailabilityRules(req.params.businessId));
  });

  app.put("/api/businesses/:businessId/availability", (req, res) => {
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    return res.json(store.replaceAvailabilityRules(req.params.businessId, parsed.data.rules));
  });

  app.get("/api/businesses/:businessId/slots", (req, res) => {
    const serviceId = String(req.query.serviceId ?? "");
    if (!serviceId) {
      return res.status(400).json({ message: "serviceId es obligatorio" });
    }

    return res.json(workflows.getAvailableSlots(req.params.businessId, serviceId));
  });

  app.get("/api/businesses/:businessId/messages", (req, res) => {
    res.json(store.getMessages(req.params.businessId, 50));
  });

  app.put("/api/businesses/:businessId/whatsapp-channel", (req, res) => {
    const parsed = whatsappChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    return res.json(
      store.upsertWhatsappChannel({
        businessId: req.params.businessId,
        ...parsed.data
      })
    );
  });

  app.put("/api/businesses/:businessId/google-calendar", (req, res) => {
    const parsed = googleCalendarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const updated = store.updateBusiness(req.params.businessId, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    return res.json(updated);
  });

  app.post("/api/businesses/:businessId/automation/process-due", async (req, res) => {
    await workflows.processDueAutomations();
    res.json({ ok: true });
  });

  app.post("/api/businesses/:businessId/simulate-incoming-message", async (req, res) => {
    const schema = z.object({
      fromPhone: z.string().min(8),
      text: z.string().min(1)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const result = await workflows.handleIncomingMessage({
      businessId: req.params.businessId,
      fromPhone: parsed.data.fromPhone,
      text: parsed.data.text
    });

    return res.json(result);
  });

  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const phoneNumberId = String(req.query.phone_number_id ?? "");

    const channel = store.getWhatsappChannelByPhoneNumberId(phoneNumberId);
    if (mode === "subscribe" && challenge && channel && token === channel.verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    const changes = req.body?.entry?.flatMap((entry: any) => entry.changes ?? []) ?? [];

    for (const change of changes) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      const channel = store.getWhatsappChannelByPhoneNumberId(phoneNumberId);
      if (!channel) {
        continue;
      }

      const messages = change.value?.messages ?? [];
      for (const message of messages) {
        const text = message.text?.body;
        const fromPhone = message.from;
        if (!text || !fromPhone) {
          continue;
        }

        await workflows.handleIncomingMessage({
          businessId: channel.businessId,
          fromPhone: fromPhone.startsWith("+") ? fromPhone : `+${fromPhone}`,
          text
        });
      }
    }

    res.json({ received: true });
  });

  if (existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }

      return res.sendFile(resolve(clientDistDir, "index.html"));
    });
  }

  return { app, store, workflows };
};
