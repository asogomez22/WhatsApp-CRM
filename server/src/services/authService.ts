import { DataStore } from "../dataStore.js";
import { AppUser, Business, PlanCode, UserRole } from "../types.js";
import { hashPasswordSync, signToken, verifyPassword, verifyToken } from "../utils/authCrypto.js";

const DEFAULT_GOOGLE_REVIEW_LINK = "https://g.page/r/demo-review-link";

const planPriceMap: Record<PlanCode, number> = {
  reviews: 39,
  anti_no_show: 49,
  auto_appointments: 79,
  full_pack: 99
};

export class AuthService {
  constructor(private readonly store: DataStore) {}

  private async buildSession(user: AppUser) {
    const updatedUser = (await this.store.updateUser(user.id, {
      lastLoginAt: new Date().toISOString()
    })) as AppUser;

    const businesses = await this.store.getBusinessesForUser(updatedUser);

    return {
      token: this.issueToken(updatedUser),
      user: this.sanitizeUser(updatedUser),
      businesses
    };
  }

  sanitizeUser(user: AppUser) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      businessIds: user.businessIds,
      lastLoginAt: user.lastLoginAt
    };
  }

  issueToken(user: AppUser) {
    return signToken(user);
  }

  verifyAccessToken(token: string) {
    return verifyToken(token);
  }

  async login(email: string, password: string) {
    const user = await this.store.findUserByEmail(email);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Credenciales invalidas");
    }

    return this.buildSession(user);
  }

  async autoLogin() {
    const users = await this.store.getUsers();
    let user =
      users.find((candidate) => candidate.active && candidate.email.toLowerCase() === "demo@tarracowebs.es") ??
      users.find((candidate) => candidate.active);

    if (!user) {
      const businesses = await this.store.getBusinesses();
      if (!businesses.length) {
        throw new Error("No hay usuarios disponibles para acceso automatico");
      }

      user = await this.store.createUser({
        email: "demo@tarracowebs.es",
        name: "Acceso automatico",
        passwordHash: hashPasswordSync("demo12345"),
        role: "platform_admin",
        businessIds: businesses.map((business) => business.id),
        active: true
      });
    }

    return this.buildSession(user);
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    phone: string;
    city: string;
    address?: string;
    plan: PlanCode;
    googleReviewLink?: string;
  }) {
    const existing = await this.store.findUserByEmail(input.email);
    if (existing) {
      throw new Error("Ya existe un usuario con ese email");
    }

    const hasUsers = await this.store.hasUsers();
    const existingBusinesses = await this.store.getBusinesses();
    const shouldClaimExistingBusinesses = !hasUsers && existingBusinesses.length > 0;
    const role: UserRole = hasUsers ? "business_admin" : "platform_admin";

    const businesses = shouldClaimExistingBusinesses
      ? existingBusinesses
      : [
          await this.store.createBusiness({
            name: input.businessName,
            email: input.email,
            phone: input.phone,
            city: input.city,
            address: input.address,
            timezone: "Europe/Madrid",
            notes: "",
            plan: input.plan,
            planPriceMonthly: planPriceMap[input.plan],
            googleReviewLink: input.googleReviewLink || DEFAULT_GOOGLE_REVIEW_LINK,
            billingStatus: hasUsers ? "unconfigured" : "trial",
            active: true
          })
        ];

    const user = await this.store.createUser({
      email: input.email,
      name: input.name,
      passwordHash: hashPasswordSync(input.password),
      role,
      businessIds: businesses.map((business) => business.id),
      active: true
    });

    return {
      token: this.issueToken(user),
      user: this.sanitizeUser(user),
      businesses
    };
  }
}
