import { describe, expect, it, mock } from "bun:test";
import { app } from "../src/app";

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {}
}));

mock.module("../src/models/User", () => ({
  User: {
    findOne: () => ({ select: async () => null }) // always fail to trigger failed attempt logic
  }
}));

describe("Auth Security & Rate Limiting", () => {
  it("should rate limit after 5 failed login attempts per minute", async () => {
    // Generate a unique IP for this test to avoid colliding with other tests
    const testIp = "192.168.100.1";
    
    // Perform 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIp
        },
        body: JSON.stringify({ email: "test@example.com", password: "Password123" })
      });
      const res = await app.handle(req);
      expect(res.status).toBe(401);
    }

    // The 6th attempt should return 429 Too Many Requests
    const req6 = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": testIp
      },
      body: JSON.stringify({ email: "test@example.com", password: "Password123" })
    });
    const res6 = await app.handle(req6);
    expect(res6.status).toBe(429);
    const data = await res6.json() as any;
    expect(data.error?.code).toBe("AUTH_RATE_LIMITED");
  });

  it("should actively reject objects or arrays to prevent NoSQL query operator injection", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.100.2"
      },
      // Using NoSQL injection payload
      body: JSON.stringify({ email: { "$ne": null }, password: "Password123" })
    });

    const res = await app.handle(req);
    // Elysia Schema validation should fail with 422 Unprocessable Entity
    expect([400, 422]).toContain(res.status);
  });
});
