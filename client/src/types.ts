export type PlanCode = "reviews" | "anti_no_show" | "auto_appointments" | "full_pack";
export type BillingStatus = "unconfigured" | "trial" | "active" | "past_due";
export type AppointmentStatus = "pending" | "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";
export type UserRole = "platform_admin" | "business_admin" | "staff";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessIds: string[];
  lastLoginAt?: string;
}

export interface Business {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address?: string;
  timezone: string;
  notes?: string;
  plan: PlanCode;
  planPriceMonthly: number;
  googleReviewLink: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billingStatus: BillingStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastInteractionAt?: string;
}

export interface Service {
  id: string;
  businessId: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

export interface AvailabilityRule {
  id: string;
  businessId: string;
  weekday: number;
  start: string;
  end: string;
}

export interface Appointment {
  id: string;
  businessId: string;
  contactId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: "manual" | "whatsapp";
  notes?: string;
  reviewRequestedAt?: string;
  reviewReminderSentAt?: string;
  reminderSentAt?: string;
  cancelledAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLog {
  id: string;
  businessId: string;
  contactId: string;
  direction: "incoming" | "outgoing";
  kind:
    | "review_request"
    | "review_followup"
    | "reminder"
    | "confirmation"
    | "assistant"
    | "human_handoff"
    | "system";
  body: string;
  appointmentId?: string;
  createdAt: string;
}

export interface WhatsappChannel {
  id: string;
  businessId: string;
  phoneE164: string;
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  verifyToken: string;
  displayName: string;
  templateNames: string[];
  templatesReady: boolean;
  metaVerified: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "done" | "pending";
}

export interface DashboardSummary {
  business: Business;
  metrics: {
    todayAppointments: number;
    pendingConfirmations: number;
    completedAppointments: number;
    noShows: number;
    reviewsPending: number;
    whatsappOpenFlows: number;
    leadsTracked: number;
    confirmedRate: number;
  };
  appointments: Appointment[];
  contacts: Contact[];
  services: Service[];
  availabilityRules: AvailabilityRule[];
  recentMessages: MessageLog[];
  channel?: WhatsappChannel;
  users: Array<Pick<SessionUser, "id" | "email" | "name" | "role" | "lastLoginAt">>;
  onboarding: {
    completed: number;
    total: number;
    completionRatio: number;
    items: OnboardingChecklistItem[];
  };
  billing: {
    status: BillingStatus;
    checkoutConfigured: boolean;
    customerId?: string;
    subscriptionId?: string;
  };
  automation: {
    reviewsReady: boolean;
    remindersReady: boolean;
    autoBookingReady: boolean;
    handoffReady: boolean;
  };
}

export interface AuthSession {
  token: string;
  user: SessionUser;
  businesses: Business[];
}

export interface BootstrapState {
  hasUsers: boolean;
  demoUser: string;
  demoPassword: string;
}
