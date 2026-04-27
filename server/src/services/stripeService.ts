import { Business } from "../types.js";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeResult = {
  configured: boolean;
  url?: string;
  customerId?: string;
};

export class StripeService {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY;
  private readonly priceId = process.env.STRIPE_PRICE_ID;
  private readonly appUrl = process.env.APP_URL || "http://localhost:3001";

  isConfigured() {
    return Boolean(this.secretKey && this.priceId);
  }

  private async post(path: string, payload: URLSearchParams) {
    if (!this.secretKey) {
      throw new Error("Stripe no configurado");
    }

    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Stripe error: ${response.status} ${JSON.stringify(data)}`);
    }

    return data;
  }

  private async ensureCustomer(business: Business) {
    if (!this.isConfigured()) {
      return undefined;
    }

    if (business.stripeCustomerId) {
      return business.stripeCustomerId;
    }

    const payload = new URLSearchParams();
    payload.set("name", business.name);
    payload.set("email", business.email);
    payload.set("metadata[business_id]", business.id);
    payload.set("phone", business.phone);

    const customer = await this.post("/customers", payload);
    return String(customer.id);
  }

  async createCheckoutLink(business: Business): Promise<StripeResult> {
    if (!this.isConfigured()) {
      return { configured: false };
    }

    const customerId = await this.ensureCustomer(business);
    const payload = new URLSearchParams();
    payload.set("mode", "subscription");
    payload.set("customer", customerId || "");
    payload.set("success_url", `${this.appUrl}/?billing=success&businessId=${business.id}`);
    payload.set("cancel_url", `${this.appUrl}/?billing=cancelled&businessId=${business.id}`);
    payload.set("line_items[0][price]", this.priceId || "");
    payload.set("line_items[0][quantity]", "1");
    payload.set("metadata[business_id]", business.id);

    const session = await this.post("/checkout/sessions", payload);
    return {
      configured: true,
      url: String(session.url),
      customerId
    };
  }

  async createPortalLink(business: Business): Promise<StripeResult> {
    if (!this.isConfigured() || !business.stripeCustomerId) {
      return { configured: false };
    }

    const payload = new URLSearchParams();
    payload.set("customer", business.stripeCustomerId);
    payload.set("return_url", `${this.appUrl}/?billing=portal&businessId=${business.id}`);

    const session = await this.post("/billing_portal/sessions", payload);
    return {
      configured: true,
      url: String(session.url),
      customerId: business.stripeCustomerId
    };
  }
}
