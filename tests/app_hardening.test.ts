import { describe, expect, it, mock } from "bun:test";
import { app } from "../src/app";

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {},
  databaseHealth: () => ({ status: "connected" ,
  resolveMongoSrvUri: async () => "mongodb://mock"})
}));

mock.module("../src/auth/session", () => ({
  requireAuth: async () => ({ userId: "user123", role: "user" }),
  createSessionToken: async () => "mock_token"
}));

mock.module("../src/modules/ai/models", () => ({
  AiChatThread: {
    findOne: () => ({ _id: "thread123", applicationId: "app123", title: "New conversation", save: async () => {} })
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

mock.module("../src/modules/ai/routes/shared", () => ({
  buildChatContext: async () => "Mock context",
  throwRouteError: (err: any) => { throw err; }
}));

mock.module("../src/modules/ai/paid-operation", () => ({
  runPaidAiOperation: async (userId: string, op: any) => {
    return {
      value: { text: "Fatal crash at C:\\Windows\\System32\\cmd.exe with stacktrace.", metadata: {} },
      tokenBalance: 100
    };
  },
  createPaidAiOperationRunner: () => {}
}));

describe("App Hardening & Output Guardrails", () => {
  it("should intercept and sanitize AI responses containing system error paths", async () => {
    const req = new Request("http://localhost/api/ai/chats/thread123/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `minerva_session=mock_token`
      },
      body: JSON.stringify({ content: "What happened to the server?" })
    });

    const res = await app.handle(req);
    expect(res.status).toBe(201);
    
    const data = await res.json() as any;
    expect(data.assistantMessage.text).toBe("I apologize, but I cannot provide that response due to safety and security guidelines.");
  });
});
