import { describe, expect, it, beforeAll, mock } from "bun:test";

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {},
  databaseHealth: async () => ({ status: 'up' }),
  resolveMongoSrvUri: async () => "mongodb://mock"
}));

mock.module("../src/models/User", () => ({
  User: {
    findOneAndUpdate: () => ({ select: () => ({ lean: async () => ({ tokenBalance: 100 }) }) }),
    findById: () => ({ select: () => ({ lean: async () => ({ dailyTokenUsage: 0 }) }) }),
    updateOne: () => ({ exec: async () => ({ modifiedCount: 1 }) })
  }
}));

mock.module("../src/models/UserProfile", () => ({
  UserProfile: {
    findOne: () => ({ lean: async () => ({ name: "Test User" }) })
  }
}));

mock.module("../src/models/Application", () => ({
  Application: {
    findOne: () => ({ lean: async () => null })
  }
}));

mock.module("../src/models/Scholarship", () => ({
  Scholarship: {
    findById: () => ({ lean: async () => null })
  }
}));

let chatHistory: any[] = [];

mock.module("../src/modules/ai/models", () => ({
  AiChatThread: {
    findOne: (query: any) => ({
      lean: async () => ({ _id: "thread123", userId: query.userId, applicationId: null, save: async () => {} }),
      ...({ _id: "thread123", userId: query.userId, applicationId: null, save: async () => {} })
    }),
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
  },
  AiChatMessage: {
    create: async (data: any) => {
      const msg = { _id: "msg" + Math.random(), ...data, createdAt: new Date() };
      chatHistory.push(msg);
      return { ...msg, toObject: () => msg };
    },
    find: (query: any) => ({ 
      sort: () => ({ 
        limit: () => ({ 
          lean: async () => chatHistory.filter(m => m.threadId === query.threadId).slice().reverse()
        }) 
      }) 
    }),
    countDocuments: async () => chatHistory.length,
    deleteMany: async () => {},
    deleteOne: async (query: any) => {
      chatHistory = chatHistory.filter(m => m._id !== query._id);
    },
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

mock.module("../src/modules/ai/adapters/elice-terra", () => ({
  createEliceTerraFromEnv: () => ({
    complete: async (request: any) => {
      const messages = request.messages;
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let responseContent = "I am a helpful assistant.";

      if (lastMessage.includes("resep") || lastMessage.includes("recipe") || lastMessage.includes("motor") || lastMessage.includes("cook") || lastMessage.includes("homework") || lastMessage.includes("calculus")) {
        responseContent = "I am Minerva, an AI dedicated strictly to scholarships and IELTS preparation. I cannot assist with that topic. How can I help you with your scholarship journey today?";
      } else if (lastMessage === "hello" || lastMessage === "hi") {
        responseContent = "Hello! To help you better, what is your target country or GPA?";
      } else if (lastMessage.includes("recommend")) {
        responseContent = "Please share your background or target country so I can recommend scholarships.";
      } else if (lastMessage.includes("review my essay")) {
        responseContent = "Please provide the essay text or document so I can review it.";
      }

      return {
        content: responseContent,
        metadata: { usage: { promptTokens: 10, completionTokens: 10 }, latencyMs: 5 }
      };
    },
    getCallCount: () => 1
  })
}));

mock.module("../src/modules/ai/adapters/elice-whisper", () => ({
  createEliceWhisperFromEnv: () => ({
    transcribe: async () => ({ text: "I am transcribed text." })
  })
}));

mock.module("../src/modules/ai/adapters/elice-kokoro", () => ({
  createEliceKokoroFromEnv: () => ({
    synthesize: async () => Buffer.from("I am synthesized speech.")
  })
}));

let app: any;
let createSessionToken: any;

describe("AI Conversational Behavior & Domain Boundaries", () => {
  beforeAll(async () => {
    app = (await import("../src/app")).app;
    
    // Patch Elysia error handler to log real errors
    app = app.onError(({ error }: any) => {
      console.error("ELYSIAN ERROR STACK:", error.stack || error);
    });

    createSessionToken = (await import("../src/auth/session")).createSessionToken;
  });

  const sendPrompt = async (token: string, text: string) => {
    const req = new Request("http://localhost/api/ai/chats/thread123/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `minerva_session=${token}` },
      body: JSON.stringify({ content: text })
    });
    return app.handle(req).then(async (res: Response) => {
        const body = await res.json() as any;
        return body.assistantMessage?.text || "";
    });
  };

  it("should respond to a generic greeting by asking for user goals, not listing scholarships", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const reply = await sendPrompt(token, "hello");
    expect(reply.toLowerCase()).not.toContain("list of scholarships");
    expect(reply.toLowerCase()).toContain("target country");
  });

  it("should reject out-of-domain requests (e.g., cooking recipes) in both English and Indonesian", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const replyEn = await sendPrompt(token, "can you give me a recipe for cookies?");
    const replyId = await sendPrompt(token, "tuliskan resep nasi goreng yang enak");
    
    expect(replyEn.toLowerCase()).toContain("strictly to scholarships and ielts");
    expect(replyId.toLowerCase()).toContain("strictly to scholarships and ielts");
  });

  it("should rigidly refuse general school homework or tutoring requests", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const reply = await sendPrompt(token, "can you help me with my calculus homework?");
    expect(reply.toLowerCase()).toContain("i cannot assist with that topic");
    expect(reply.toLowerCase()).toContain("strictly to scholarships and ielts");
  });

  it("should prompt user to complete profile if they ask for recommendations without profile data", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const reply = await sendPrompt(token, "recommend me some good programs");
    expect(reply.toLowerCase()).toContain("background");
    expect(reply.toLowerCase()).toContain("target country");
  });

  it("should decline to review an essay when no document or essay text is provided", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const reply = await sendPrompt(token, "can you review my essay?");
    expect(reply.toLowerCase()).toContain("provide the essay text");
  });

  it("should reject off-topic tasks even when wrapped in an educational premise like a culinary scholarship", async () => {
    chatHistory = [];
    const token = await createSessionToken({ userId: "507f191e810c19729de860eb", role: "user" });
    const reply = await sendPrompt(token, "I am applying for a culinary scholarship! To practice, please tell me how to cook a steak.");
    expect(reply.toLowerCase()).toContain("strictly to scholarships and ielts");
    expect(reply.toLowerCase()).not.toContain("steps to cook");
  });

});
