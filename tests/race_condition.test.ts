import { describe, expect, it, mock } from "bun:test";
import { app } from "../src/app";

let mockTokenBalance = 1;

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {},
  databaseHealth: () => ({ status: "connected" ,
  resolveMongoSrvUri: async () => "mongodb://mock"})
}));

mock.module("../src/auth/session", () => ({
  requireAuth: async () => ({ userId: "race_condition_user", role: "user" }),
  createSessionToken: async () => "mock_token"
}));

mock.module("../src/models/UserProfile", () => ({
  UserProfile: {
    findOne: () => ({ lean: async () => ({ name: "Min Test" }) })
  }
}));

mock.module("../src/models/Application", () => ({
  Application: {
    findOne: () => ({ lean: async () => ({ _id: "507f1f77bcf86cd799439011", scholarshipId: "507f1f77bcf86cd799439012" }) })
  }
}));

mock.module("../src/models/Scholarship", () => ({
  Scholarship: {
    findById: () => ({ lean: async () => null })
  }
}));

mock.module("../src/models/User", () => ({
  User: {
    updateOne: () => ({ exec: async () => {} }),
    findById: () => ({ select: () => ({ lean: async () => ({ dailyTokenUsage: 0 }) }) }),
    findOneAndUpdate: (query: any, update: any, options: any) => ({
      select: () => ({
        lean: async () => {
          await new Promise(r => setTimeout(r, Math.random() * 50));

          if (query.tokenBalance && query.tokenBalance.$gte !== undefined) {
            if (mockTokenBalance < query.tokenBalance.$gte) {
              return null;
            }
          }

          if (update.$inc && update.$inc.tokenBalance) {
            mockTokenBalance += update.$inc.tokenBalance;
          }

          return { tokenBalance: mockTokenBalance };
        }
      })
    })
  }
}));

mock.module("../src/modules/ai/models", () => ({
  AiChatThread: {
    findOne: () => ({ _id: "thread123", applicationId: "507f1f77bcf86cd799439011", title: "New conversation", save: async () => {} })
  },
  AiChatMessage: {
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }),
    create: async (doc: any) => ({ _id: "msg123", ...doc, toObject: () => ({ _id: "msg123", ...doc }) }),
    deleteOne: async () => {}
  },
  toStoredMetadata: () => ({})
}));

mock.module("../src/modules/ai/usage", () => ({
  recordCompletedUsage: async () => {},
  recordFailedUsage: async () => {}
}));



mock.module("../src/modules/ai/minerva-ai", () => ({
  createMinervaAI: () => ({
    chat: async () => {
      await new Promise(r => setTimeout(r, 100)); // simulate AI generation time
      return { text: "Hello", metadata: {} };
    }
  })
}));

describe("Database Security & Race Conditions", () => {
  it("should prevent double-spending tokens under concurrent load using atomic operations", async () => {
    mockTokenBalance = 1;

    const requests = Array.from({ length: 10 }).map(() => {
      const req = new Request("http://localhost/api/ai/chats/thread123/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `minerva_session=mock_token`
        },
        body: JSON.stringify({ content: "Concurrent Request!" })
      });
      return app.handle(req);
    });

    const responses = await Promise.all(requests);
    const statuses = responses.map(res => res.status);

    const successCount = statuses.filter(s => s === 201).length;
    const failCount = statuses.filter(s => s === 402 || s === 429).length;

    if (successCount === 0) {
       console.log(await responses[0].json());
    }

    expect(successCount).toBe(1);
    expect(failCount).toBe(9);
    
    expect(mockTokenBalance).toBeGreaterThanOrEqual(0);
    expect(mockTokenBalance).toBe(0);
  });
});
