export type PlanCode = "reviews" | "anti_no_show" | "auto_appointments" | "full_pack";
export type AppointmentStatus =
  | "pending"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";
export type MessageDirection = "incoming" | "outgoing";
export type MessageKind = "review_request" | "reminder" | "confirmation" | "assistant" | "human_handoff";
export type FlowStep = "idle" | "choose_service" | "choose_slot" | "handoff";

export interface Business {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  plan: PlanCode;
  googleReviewLink: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  active: boolean;
  createdAt: string;
  googleCalendarConnected: boolean;
  googleCalendarId?: string;
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
  templatesReady: boolean;
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
  googleCalendarEventId?: string;
  reviewRequestedAt?: string;
  reminderSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationState {
  id: string;
  businessId: string;
  contactId: string;
  step: FlowStep;
  selectedServiceId?: string;
  offeredSlots?: string[];
  updatedAt: string;
}

export interface MessageLog {
  id: string;
  businessId: string;
  contactId: string;
  direction: MessageDirection;
  kind: MessageKind;
  body: string;
  appointmentId?: string;
  createdAt: string;
}

export interface AppDatabase {
  businesses: Business[];
  whatsappChannels: WhatsappChannel[];
  contacts: Contact[];
  services: Service[];
  availabilityRules: AvailabilityRule[];
  appointments: Appointment[];
  messages: MessageLog[];
  conversationStates: ConversationState[];
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
  channel?: WhatsappChannel;
}
