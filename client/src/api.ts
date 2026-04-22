import { DashboardSummary, Appointment, Business } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  getBusinesses: async () => parseJson<Business[]>(await fetch("/api/businesses")),
  getDashboard: async (businessId: string, date: string) =>
    parseJson<DashboardSummary>(await fetch(`/api/businesses/${businessId}/dashboard?date=${date}`)),
  createAppointment: async (businessId: string, body: Partial<Appointment>) =>
    parseJson<Appointment>(
      await fetch(`/api/businesses/${businessId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    ),
  updateAppointment: async (businessId: string, appointmentId: string, body: { status?: string; notes?: string }) =>
    parseJson<Appointment>(
      await fetch(`/api/businesses/${businessId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    ),
  processAutomations: async (businessId: string) =>
    parseJson<{ ok: boolean }>(
      await fetch(`/api/businesses/${businessId}/automation/process-due`, {
        method: "POST"
      })
    ),
  simulateIncomingMessage: async (businessId: string, body: { fromPhone: string; text: string }) =>
    parseJson<{ action: string }>(
      await fetch(`/api/businesses/${businessId}/simulate-incoming-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    )
};
