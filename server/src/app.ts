import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DataStore } from "./dataStore.js";
import { AuthService } from "./services/authService.js";
import { StripeService } from "./services/stripeService.js";
import { WhatsappService } from "./services/whatsappService.js";
import { WorkflowEngine } from "./services/workflowEngine.js";
import { AppUser, BillingStatus, PlanCode } from "./types.js";

const planPriceMap: Record<PlanCode, number> = {
  reviews: 39,
  anti_no_show: 49,
  auto_appointments: 79,
  full_pack: 99
};

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(2),
  phone: z.string().min(8),
  city: z.string().min(2),
  address: z.string().optional(),
  plan: z.enum(["reviews", "anti_no_show", "auto_appointments", "full_pack"]),
  googleReviewLink: z.string().url().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const adminClientSchema = z.object({
  businessName: z.string().min(2),
  businessEmail: z.string().email(),
  phone: z.string().min(8),
  city: z.string().min(2),
  address: z.string().optional(),
  timezone: z.string().min(2).default("Europe/Madrid"),
  notes: z.string().optional(),
  plan: z.enum(["reviews", "anti_no_show", "auto_appointments", "full_pack"]),
  googleReviewLink: z.string().url(),
  billingStatus: z.enum(["unconfigured", "trial", "active", "past_due"]).default("trial"),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(10).max(128)
});

const businessSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  city: z.string().min(2),
  address: z.string().optional(),
  timezone: z.string().min(2).default("Europe/Madrid"),
  notes: z.string().optional(),
  plan: z.enum(["reviews", "anti_no_show", "auto_appointments", "full_pack"]),
  googleReviewLink: z.string().url(),
  billingStatus: z.enum(["unconfigured", "trial", "active", "past_due"]).default("unconfigured"),
  active: z.boolean().default(true)
});

const businessPatchSchema = businessSchema.partial();

const contactSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).default([])
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
  templateNames: z.array(z.string().min(2)).default([]),
  templatesReady: z.boolean().default(false),
  metaVerified: z.boolean().default(false),
  active: z.boolean().default(true)
});

type AuthenticatedRequest = Request & {
  currentUser?: AppUser;
};

const getRouteBusinessId = (req: Request) => String(req.params.businessId ?? "");

const getRouteAppointmentId = (req: Request) => String(req.params.appointmentId ?? "");

const getRouteContactId = (req: Request) => String(req.params.contactId ?? "");

const authAttempts = new Map<string, { count: number; resetAt: number }>();

const checkLoginRateLimit = (req: Request, email: string) => {
  const now = Date.now();
  const key = `${req.ip}:${email.toLowerCase()}`;
  const current = authAttempts.get(key);

  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }

  if (current.count >= 8) {
    return false;
  }

  current.count += 1;
  return true;
};

const clearLoginRateLimit = (req: Request, email: string) => {
  authAttempts.delete(`${req.ip}:${email.toLowerCase()}`);
};

const asyncRoute =
  (
    handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown> | unknown
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as AuthenticatedRequest, res, next)).catch(next);
  };

export const createApp = async () => {
  const app = express();
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const clientDistDir = resolve(serverDir, "../../client/dist");
  const store = new DataStore();
  await store.ready();

  const whatsapp = new WhatsappService();
  const workflows = new WorkflowEngine(store, whatsapp);
  const auth = new AuthService(store);
  const stripe = new StripeService();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const requireAuth = asyncRoute(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    try {
      const session = auth.verifyAccessToken(token);
      const user = await store.getUserById(session.sub);
      if (!user || !user.active) {
        return res.status(401).json({ message: "User not found" });
      }

      req.currentUser = user;
      next();
    } catch (error) {
      return res.status(401).json({
        message: error instanceof Error ? error.message : "Invalid token"
      });
    }
  });

  const requireBusinessAccess = asyncRoute(async (req, res, next) => {
    const businessId = getRouteBusinessId(req);
    const user = req.currentUser;

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (user.role === "platform_admin" || user.businessIds.includes(businessId)) {
      return next();
    }

    return res.status(403).json({ message: "No access to this business" });
  });

  const requirePlatformAdmin = asyncRoute(async (req, res, next) => {
    const user = req.currentUser;

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (user.role !== "platform_admin") {
      return res.status(403).json({ message: "Platform admin role required" });
    }

    return next();
  });

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) : true,
      credentials: false
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      res.json({
        ok: true,
        storage: store.getStorageMode(),
        auth: "jwt",
        stripeConfigured: stripe.isConfigured(),
        hasUsers: await store.hasUsers()
      });
    })
  );

  app.get(
    "/api/auth/bootstrap-state",
    asyncRoute(async (_req, res) => {
      const hasUsers = await store.hasUsers();

      res.json({
        hasUsers,
        demoUser: "",
        demoPassword: ""
      });
    })
  );

  app.post(
    "/api/auth/auto-login",
    asyncRoute(async (_req, res) => {
      if (process.env.ALLOW_AUTO_LOGIN !== "true") {
        return res.status(403).json({ message: "Acceso automatico deshabilitado" });
      }

      return res.json(await auth.autoLogin());
    })
  );

  app.post(
    "/api/auth/register",
    asyncRoute(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      try {
        const session = await auth.register(parsed.data);
        return res.status(201).json(session);
      } catch (error) {
        return res.status(409).json({ message: error instanceof Error ? error.message : "No se pudo registrar" });
      }
    })
  );

  app.post(
    "/api/auth/login",
    asyncRoute(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      if (!checkLoginRateLimit(req, parsed.data.email)) {
        return res.status(429).json({ message: "Demasiados intentos. Prueba de nuevo en unos minutos." });
      }

      try {
        const session = await auth.login(parsed.data.email, parsed.data.password);
        clearLoginRateLimit(req, parsed.data.email);
        return res.json(session);
      } catch {
        return res.status(401).json({ message: "Credenciales invalidas" });
      }
    })
  );

  app.get(
    "/api/admin/clients",
    requireAuth,
    requirePlatformAdmin,
    asyncRoute(async (_req, res) => {
      const businesses = await store.getBusinesses();
      const users = await store.getUsers();

      res.json(
        businesses.map((business) => ({
          business,
          users: users
            .filter((user) => user.businessIds.includes(business.id))
            .map((user) => auth.sanitizeUser(user))
        }))
      );
    })
  );

  app.post(
    "/api/admin/clients",
    requireAuth,
    requirePlatformAdmin,
    asyncRoute(async (req, res) => {
      const parsed = adminClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      try {
        const client = await auth.createClient(parsed.data);
        return res.status(201).json(client);
      } catch (error) {
        return res.status(409).json({ message: error instanceof Error ? error.message : "No se pudo crear cliente" });
      }
    })
  );

  app.get(
    "/api/auth/me",
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.currentUser as AppUser;
      const businesses = await store.getBusinessesForUser(user);
      res.json({
        user: auth.sanitizeUser(user),
        businesses
      });
    })
  );

  app.get(
    "/api/businesses",
    requireAuth,
    asyncRoute(async (req, res) => {
      res.json(await store.getBusinessesForUser(req.currentUser as AppUser));
    })
  );

  app.post(
    "/api/businesses",
    requireAuth,
    requirePlatformAdmin,
    asyncRoute(async (req, res) => {
      const parsed = businessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const business = await store.createBusiness({
        ...parsed.data,
        planPriceMonthly: planPriceMap[parsed.data.plan]
      });

      await store.addBusinessAccess((req.currentUser as AppUser).id, business.id);
      return res.status(201).json(business);
    })
  );

  app.patch(
    "/api/businesses/:businessId",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const parsed = businessPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const user = req.currentUser as AppUser;
      if (user.role !== "platform_admin") {
        const restrictedKeys = ["plan", "billingStatus", "active"] as const;
        if (restrictedKeys.some((key) => parsed.data[key] !== undefined)) {
          return res.status(403).json({ message: "Solo un admin puede cambiar plan, billing o estado" });
        }
      }

      const patch = {
        ...parsed.data,
        planPriceMonthly: parsed.data.plan ? planPriceMap[parsed.data.plan] : undefined
      };
      const updated = await store.updateBusiness(getRouteBusinessId(req), patch);
      if (!updated) {
        return res.status(404).json({ message: "Business not found" });
      }

      return res.json(updated);
    })
  );

  app.get(
    "/api/businesses/:businessId/dashboard",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
      const dashboard = await store.getDashboardSummary(getRouteBusinessId(req), date);

      if (!dashboard) {
        return res.status(404).json({ message: "Business not found" });
      }

      return res.json(dashboard);
    })
  );

  app.get(
    "/api/businesses/:businessId/onboarding",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const dashboard = await store.getDashboardSummary(getRouteBusinessId(req), new Date().toISOString().slice(0, 10));
      if (!dashboard) {
        return res.status(404).json({ message: "Business not found" });
      }

      res.json(dashboard.onboarding);
    })
  );

  app.get(
    "/api/businesses/:businessId/appointments",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      res.json(await store.getAppointments(getRouteBusinessId(req), date));
    })
  );

  app.post(
    "/api/businesses/:businessId/appointments",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const parsed = appointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const business = await store.getBusiness(businessId);
      const contact = await store.getContact(parsed.data.contactId);
      const service = await store.getService(parsed.data.serviceId);

      if (!business || !contact || !service) {
        return res.status(404).json({ message: "Business, contact or service not found" });
      }

      if (contact.businessId !== businessId || service.businessId !== businessId) {
        return res.status(400).json({ message: "Contact and service must belong to the same business" });
      }

      const appointment = await store.createAppointment({
        businessId,
        ...parsed.data
      });

      return res.status(201).json(appointment);
    })
  );

  app.patch(
    "/api/businesses/:businessId/appointments/:appointmentId",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const appointmentId = getRouteAppointmentId(req);
      const parsed = appointmentPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const existing = await store.getAppointment(appointmentId);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const updated = await store.updateAppointment(appointmentId, parsed.data);
      return res.json(updated);
    })
  );

  app.get(
    "/api/businesses/:businessId/contacts",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      res.json(await store.getContacts(getRouteBusinessId(req)));
    })
  );

  app.post(
    "/api/businesses/:businessId/contacts",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const parsed = contactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const contact = await store.createContact({
        businessId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || undefined,
        notes: parsed.data.notes,
        tags: parsed.data.tags
      });

      res.status(201).json(contact);
    })
  );

  app.patch(
    "/api/businesses/:businessId/contacts/:contactId",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const contactId = getRouteContactId(req);
      const parsed = contactSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const existing = await store.getContact(contactId);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const updated = await store.updateContact(contactId, {
        ...parsed.data,
        email: parsed.data.email || undefined
      });
      return res.json(updated);
    })
  );

  app.delete(
    "/api/businesses/:businessId/contacts/:contactId",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const contactId = getRouteContactId(req);
      const existing = await store.getContact(contactId);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      await store.deleteContact(contactId);
      return res.status(204).send();
    })
  );

  app.get(
    "/api/businesses/:businessId/services",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      res.json(await store.getServices(getRouteBusinessId(req)));
    })
  );

  app.post(
    "/api/businesses/:businessId/services",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const parsed = serviceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      return res.status(201).json(
        await store.createService({
          businessId,
          ...parsed.data
        })
      );
    })
  );

  app.get(
    "/api/businesses/:businessId/availability",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      res.json(await store.getAvailabilityRules(getRouteBusinessId(req)));
    })
  );

  app.put(
    "/api/businesses/:businessId/availability",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const parsed = availabilitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      return res.json(await store.replaceAvailabilityRules(businessId, parsed.data.rules));
    })
  );

  app.get(
    "/api/businesses/:businessId/slots",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const serviceId = String(req.query.serviceId ?? "");
      if (!serviceId) {
        return res.status(400).json({ message: "serviceId is required" });
      }

      return res.json(await workflows.getAvailableSlots(businessId, serviceId));
    })
  );

  app.get(
    "/api/businesses/:businessId/messages",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      res.json(await store.getMessages(getRouteBusinessId(req), 50));
    })
  );

  app.put(
    "/api/businesses/:businessId/whatsapp-channel",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const parsed = whatsappChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      return res.json(
        await store.upsertWhatsappChannel({
          businessId,
          ...parsed.data
        })
      );
    })
  );

  app.post(
    "/api/businesses/:businessId/automation/process-due",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      await workflows.processDueAutomationsForBusiness(getRouteBusinessId(req));
      res.json({ ok: true });
    })
  );

  app.post(
    "/api/businesses/:businessId/simulate-incoming-message",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const businessId = getRouteBusinessId(req);
      const schema = z.object({
        fromPhone: z.string().min(8),
        text: z.string().min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const result = await workflows.handleIncomingMessage({
        businessId,
        fromPhone: parsed.data.fromPhone,
        text: parsed.data.text
      });

      return res.json(result);
    })
  );

  app.post(
    "/api/businesses/:businessId/billing/checkout-link",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const business = await store.getBusiness(getRouteBusinessId(req));
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      const link = await stripe.createCheckoutLink(business);
      if (!link.configured) {
        return res.status(400).json({ message: "Stripe is not configured" });
      }

      if (link.customerId && !business.stripeCustomerId) {
        await store.updateBusiness(business.id, {
          stripeCustomerId: link.customerId,
          billingStatus: "trial" as BillingStatus
        });
      }

      res.json(link);
    })
  );

  app.post(
    "/api/businesses/:businessId/billing/portal-link",
    requireAuth,
    requireBusinessAccess,
    asyncRoute(async (req, res) => {
      const business = await store.getBusiness(getRouteBusinessId(req));
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      const link = await stripe.createPortalLink(business);
      if (!link.configured) {
        return res.status(400).json({ message: "Stripe portal is not configured" });
      }

      res.json(link);
    })
  );

  app.get(
    "/api/whatsapp/webhook",
    asyncRoute(async (req, res) => {
      const mode = String(req.query["hub.mode"] ?? "");
      const token = String(req.query["hub.verify_token"] ?? "");
      const challenge = String(req.query["hub.challenge"] ?? "");
      const phoneNumberId = String(req.query.phone_number_id ?? "");

      const channel = await store.getWhatsappChannelByPhoneNumberId(phoneNumberId);
      if (mode === "subscribe" && challenge && channel && token === channel.verifyToken) {
        return res.status(200).send(challenge);
      }

      return res.sendStatus(403);
    })
  );

  app.post(
    "/api/whatsapp/webhook",
    asyncRoute(async (req, res) => {
      const changes = req.body?.entry?.flatMap((entry: { changes?: unknown[] }) => entry.changes ?? []) ?? [];

      for (const rawChange of changes as Array<Record<string, any>>) {
        const phoneNumberId = rawChange.value?.metadata?.phone_number_id;
        const channel = await store.getWhatsappChannelByPhoneNumberId(phoneNumberId);
        if (!channel) {
          continue;
        }

        const messages = rawChange.value?.messages ?? [];
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
    })
  );

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("api_error", error);
    res.status(500).json({
      message: error.message || "Unexpected server error"
    });
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
