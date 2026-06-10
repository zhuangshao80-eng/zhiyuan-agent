import type { PermissionLevel } from "./permission.js";

export interface Grant {
  id: string;
  subject: string;
  resource: string;
  level: PermissionLevel;
  expiresAt?: string;
  createdAt: string;
}

export class GrantRegistry {
  private readonly grants = new Map<string, Grant>();

  grant(input: Omit<Grant, "id" | "createdAt">): Grant {
    const grant: Grant = {
      ...input,
      id: `grant_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    };
    this.grants.set(grant.id, grant);
    return grant;
  }

  revoke(id: string): boolean {
    return this.grants.delete(id);
  }

  has(subject: string, resource: string, level: PermissionLevel): boolean {
    const now = Date.now();
    return [...this.grants.values()].some(
      (grant) =>
        grant.subject === subject &&
        grant.resource === resource &&
        grant.level === level &&
        (!grant.expiresAt || Date.parse(grant.expiresAt) > now)
    );
  }

  list(): Grant[] {
    return [...this.grants.values()];
  }
}
