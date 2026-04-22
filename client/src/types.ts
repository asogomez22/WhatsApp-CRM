export type PlanCode = "reviews" | "anti_no_show" | "auto_appointments" | "full_pack";
export type AppointmentStatus = "pending" | "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";

export interface Business {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  plan: PlanCode;
  googleReviewLink: string;
  active: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  tags: string[];
  createdAt: string;
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
  reminderSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLog {
  id: string;
  businessId: string;
  contactId: string;
  direction: "incoming" | "outgoing";
  kind: "review_request" | "reminder" | "confirmation" | "assistant" | "human_handoff";
  body: string;
  appointmentId?: string;
  createdAt: string;
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
  };
  appointments: Appointment[];
  contacts: Contact[];
  services: Service[];
  availabilityRules: AvailabilityRule[];
  recentMessages: MessageLog[];
  channel?: {
    phoneE164: string;
    phoneNumberId: string;
    displayName: string;
    templatesReady: boolean;
    active: boolean;
  };
}
