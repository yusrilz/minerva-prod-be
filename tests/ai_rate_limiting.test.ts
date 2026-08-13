import { describe, expect, it, beforeAll } from "bun:test";
import { mock } from "bun:test";

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {},
  databaseHealth: async () => ({ status: 'up' })
}));



mock.module("../src/models/User", () => {
  const users: Record<string, any> = {
    "507f191e810c19729de860eb": { 
      _id: "507f191e810c19729de860eb", 
      tokenBalance: 100, 
      dailyTokenUsage: 0,
      dailyTokenResetAt: new Date(),
    },
    "507f191e810c19729de860ec": {
      _id: "507f191e810c19729de860ec",
      tokenBalance: 100,
      dailyTokenUsage: 105000, // Over the 100k limit
      dailyTokenResetAt: new Date(),
    }
  };

  return {
    User: {
      updateOne: async () => ({ modifiedCount: 1 }),
      findOneAndUpdate: (query: any) => ({
        select: () => ({
          lean: async () => {
            const user = users[query._id];
            if (!user) return null;
            if (query.tokenBalance?.$gte === 1 && user.tokenBalance >= 1) {
              if (query.dailyTokenUsage?.$lt === 100000 && user.dailyTokenUsage >= 100000) {
                return null; // Simulate budget exhaustion
              }
              user.tokenBalance -= 1;
              return user;
            }
            return null;
          }
        })
      }),
      findById: (id: string) => ({
        select: () => ({ lean: async () => users[id] })
      })
    }
  }
});

mock.module("../src/models/UserProfile", () => ({
  UserProfile: {
    findOne: () => ({
      lean: async () => ({ name: "Test User" })
    })
  }
}));

mock.module("../src/models/Application", () => ({
  Application: {
    findOne: () => ({
      lean: async () => null
    })
  }
}));

mock.module("../src/models/Scholarship", () => ({
  Scholarship: {
    findById: () => ({
      lean: async () => null
    })
  }
}));

mock.module("../src/modules/ai/adapters/elice-terra", () => ({
  createEliceTerraFromEnv: () => {
    let callCount = 0;
    return {
      complete: async () => {
        callCount++;
        return {
          content: "Mocked response",
          metadata: { usage: { promptTokens: 50, completionTokens: 50 }, latencyMs: 10 }
        }
      },
      getCallCount: () => callCount
    }
  }
}));

mock.module("../src/modules/ai/models", () => ({
  AiChatThread: {
    findOne: (query: any) => ({
      lean: async () => ({ _id: "507f191e810c19729de860ea", userId: query.userId, applicationId: null, save: async () => {} }),
      ...({ _id: "507f191e810c19729de860ea", userId: query.userId, applicationId: null, save: async () => {} })
    }),
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
  },
  AiChatMessage: {
    create: async (data: any) => ({ _id: "msg123", ...data }),
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }),
    countDocuments: async () => 0,
    deleteMany: async () => {},
    deleteOne: async () => {},
  },
  AiUsage: {
    create: async () => {}
  },
  DocumentAiReview: {},
  InterviewSession: {},
  IeltsAiEvaluation: {},
  AiRecommendationDaily: {},
  toStoredMetadata: (meta: any) => meta
}));

let app: any;
let createSessionToken: any;

describe("Advanced AI - Endpoint Spamming & Token Budgeting", () => {
  beforeAll(async () => {
    app = (await import("../src/app")).app;
    createSessionToken = (await import("../src/auth/session")).createSessionToken;
  });

  it("should enforce strict API Rate Limiting (max 20 requests/minute per User ID)", async () => {
    let tooManyRequestsCount = 0;
    let successCount = 0;

    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });

    // Simulate 40 concurrent requests (limit is 20)
    const requests = Array.from({ length: 40 }).map(() => {
      const req = new Request("http://localhost/api/ai/chats/507f191e810c19729de860ea/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `minerva_session=${token}`
        },
        body: JSON.stringify({ content: "Hello AI!" })
      });
      return app.handle(req).then((res: Response) => {
        if (res.status === 429) tooManyRequestsCount++;
        if (res.status === 200) successCount++;
      });
    });

    await Promise.all(requests);

    expect(successCount).toBeLessThanOrEqual(20);
    expect(tooManyRequestsCount).toBeGreaterThan(0);
  });

  it("should enforce Account-Level Budgeting and pause access over 100k tokens", async () => {
    const exhaustedToken = await createSessionToken({ userId: "507f191e810c19729de860ec", role: "user" });
    // Mock user has 105,000 tokens used
    const req = new Request("http://localhost/api/ai/chats/507f191e810c19729de860ea/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `minerva_session=${exhaustedToken}` 
      },
      body: JSON.stringify({ content: "Hello AI!" })
    });

    const res = await app.handle(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.code).toBe("AI_BUDGET_EXHAUSTED");
  });
});
