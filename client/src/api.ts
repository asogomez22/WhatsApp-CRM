import {
  Appointment,
  AuthSession,
  BootstrapState,
  Business,
  Contact,
  DashboardSummary,
  Service,
  WhatsappChannel
} from "./types";

const TOKEN_STORAGE_KEY = "whatsapp-crm-auth-token";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();

    try {
      const parsed = JSON.parse(text) as { message?: string };
      throw new Error(parsed.message || "Request failed");
    } catch {
      throw new Error(text || "Request failed");
    }
  }

  return response.json() as Promise<T>;
}

class ApiClient {
  private token = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";

  getToken() {
    return this.token;
  }

  setToken(token: string) {
    this.token = token;
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return;
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return parseJson<T>(
      await fetch(path, {
        ...init,
        headers
      })
    );
  }

  getBootstrapState() {
    return this.request<BootstrapState>("/api/auth/bootstrap-state");
  }

  login(body: { email: string; password: string }) {
    return this.request<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  register(body: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    phone: string;
    city: string;
    address?: string;
    plan: Business["plan"];
    googleReviewLink?: string;
  }) {
    return this.request<AuthSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  getSession() {
    return this.request<{ user: AuthSession["user"]; businesses: Business[] }>("/api/auth/me");
  }

  getBusinesses() {
    return this.request<Business[]>("/api/businesses");
  }

  createBusiness(body: {
    name: string;
    email: string;
    phone: string;
    city: string;
    address?: string;
    timezone?: string;
    notes?: string;
    plan: Business["plan"];
    googleReviewLink: string;
    billingStatus?: Business["billingStatus"];
    active?: boolean;
  }) {
    return this.request<Business>("/api/businesses", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  updateBusiness(businessId: string, body: Partial<Business>) {
    return this.request<Business>(`/api/businesses/${businessId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  }

  getDashboard(businessId: string, date: string) {
    return this.request<DashboardSummary>(`/api/businesses/${businessId}/dashboard?date=${date}`);
  }

  createAppointment(
    businessId: string,
    body: Pick<Appointment, "contactId" | "serviceId" | "startAt" | "endAt" | "status" | "source" | "notes">
  ) {
    return this.request<Appointment>(`/api/businesses/${businessId}/appointments`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  updateAppointment(businessId: string, appointmentId: string, body: { status?: string; notes?: string }) {
    return this.request<Appointment>(`/api/businesses/${businessId}/appointments/${appointmentId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  }

  createContact(
    businessId: string,
    body: Pick<Contact, "name" | "phone" | "email" | "notes" | "tags">
  ) {
    return this.request<Contact>(`/api/businesses/${businessId}/contacts`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  createService(businessId: string, body: Pick<Service, "name" | "durationMinutes" | "active">) {
    return this.request<Service>(`/api/businesses/${businessId}/services`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  saveAvailability(
    businessId: string,
    rules: Array<{
      weekday: number;
      start: string;
      end: string;
    }>
  ) {
    return this.request(`/api/businesses/${businessId}/availability`, {
      method: "PUT",
      body: JSON.stringify({ rules })
    });
  }

  saveWhatsappChannel(
    businessId: string,
    body: Pick<
      WhatsappChannel,
      | "phoneE164"
      | "phoneNumberId"
      | "wabaId"
      | "accessTokenEncrypted"
      | "verifyToken"
      | "displayName"
      | "templateNames"
      | "templatesReady"
      | "metaVerified"
      | "active"
    >
  ) {
    return this.request<WhatsappChannel>(`/api/businesses/${businessId}/whatsapp-channel`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }

  processAutomations(businessId: string) {
    return this.request<{ ok: boolean }>(`/api/businesses/${businessId}/automation/process-due`, {
      method: "POST"
    });
  }

  simulateIncomingMessage(businessId: string, body: { fromPhone: string; text: string }) {
    return this.request<{ action: string }>(`/api/businesses/${businessId}/simulate-incoming-message`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  createCheckoutLink(businessId: string) {
    return this.request<{ url: string }>(`/api/businesses/${businessId}/billing/checkout-link`, {
      method: "POST"
    });
  }

  createPortalLink(businessId: string) {
    return this.request<{ url: string }>(`/api/businesses/${businessId}/billing/portal-link`, {
      method: "POST"
    });
  }
}

export const api = new ApiClient();
