import { describe, expect, it, beforeAll, mock } from "bun:test";

let userDeleted = false;
let cascadeDeleted: Record<string, boolean> = {};

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {},
  databaseHealth: async () => ({ status: 'up' })
}));

mock.module("../src/models/User", () => ({
  User: {
    findById: (id: any) => ({
      _id: "user123",
      role: 'user',
      deleteOne: async () => { userDeleted = true; }
    })
  }
}));

const mockDeleteMany = (modelName: string) => {
  return async () => {
    cascadeDeleted[modelName] = true;
  };
};

mock.module("../src/models/UserProfile", () => ({
  UserProfile: { deleteMany: mockDeleteMany("UserProfile") }
}));
mock.module("../src/models/Transaction", () => ({
  Transaction: { deleteMany: mockDeleteMany("Transaction") }
}));
mock.module("../src/models/Application", () => ({
  Application: { deleteMany: mockDeleteMany("Application") }
}));
mock.module("../src/models/Document", () => ({
  Document: { deleteMany: mockDeleteMany("Document") }
}));
mock.module("../src/models/AIReview", () => ({
  AIReview: { deleteMany: mockDeleteMany("AIReview") }
}));
mock.module("../src/models/ChecklistItem", () => ({
  ChecklistItem: { deleteMany: mockDeleteMany("ChecklistItem") }
}));
mock.module("../src/models/Mentor", () => ({
  Mentor: { deleteMany: mockDeleteMany("Mentor") }
}));
mock.module("../src/models/Pipeline", () => ({
  Pipeline: { deleteMany: mockDeleteMany("Pipeline") }
}));
mock.module("../src/models/IELTS", () => ({
  IELTSSubmission: { deleteMany: mockDeleteMany("IELTSSubmission") },
  IeltsResult: { deleteMany: mockDeleteMany("IeltsResult") }
}));

mock.module("../src/modules/ai/models", () => ({
  AiChatThread: { deleteMany: mockDeleteMany("AiChatThread") },
  AiChatMessage: { deleteMany: mockDeleteMany("AiChatMessage") },
  AiUsage: { deleteMany: mockDeleteMany("AiUsage") },
  DocumentAiReview: { deleteMany: mockDeleteMany("DocumentAiReview") },
  toStoredMetadata: (x: any) => x
}));

import { encryptField, decryptField } from '../src/models/UserProfile';
import { app } from '../src/app';
import { createSessionToken } from '../src/auth/session';

describe('Phase 6: Infrastructure & Privacy', () => {
  beforeAll(() => {
    process.env.FLE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('should implement field-level encryption for sensitive PII', () => {
    const rawPhoneNumber = '123-456-7890';
    
    // Test Encrypt
    const encrypted = encryptField(rawPhoneNumber);
    expect(encrypted).not.toBe(rawPhoneNumber);
    expect(encrypted).toContain(':'); // Should have iv:authTag:cipher format
    
    // Test Decrypt
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(rawPhoneNumber);
    
    // Null handling
    expect(encryptField(null)).toBe(null);
    expect(decryptField(null)).toBe(null);
  });

  it('should trigger a hard-purge database cascade on DELETE /api/users/me', async () => {
    const token = await createSessionToken({ userId: "user123", role: 'user' });
    const req = new Request("http://localhost/api/users/me", {
      method: "DELETE",
      headers: { Cookie: `minerva_session=${token}` }
    });
    
    const res = await app.handle(req);
    if (res.status === 500) {
      console.error(await res.json());
    }
    expect(res.status).toBe(200);
    expect(userDeleted).toBe(true);

    const expectedCollections = [
      'UserProfile', 'AiChatThread', 'AiChatMessage', 'AiUsage', 'DocumentAiReview',
      'Transaction', 'Application', 'Document', 'AIReview', 'ChecklistItem',
      'Mentor', 'Pipeline', 'IELTSSubmission', 'IeltsResult'
    ];

    for (const coll of expectedCollections) {
      expect(cascadeDeleted[coll]).toBe(true);
    }
  });
});
