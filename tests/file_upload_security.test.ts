import { describe, expect, it, mock } from "bun:test";
import { app } from "../src/app";

mock.module("../src/db/mongo", () => ({
  requireDatabase: () => {},
  connectDatabase: async () => true,
  disconnectDatabase: async () => {}
}));

mock.module("../src/auth/session", () => ({
  requireAuth: async () => ({ userId: "user123", role: "user" }),
  createSessionToken: async () => "mock_token"
}));

mock.module("../src/modules/applications/service", () => ({
  findOwnedApplication: async () => ({ _id: "app123", userId: "user123" })
}));

describe("File Upload Security", () => {
  it("should reject a text file disguised with a .pdf extension due to magic number validation", async () => {
    const fakeContent = "This is not a PDF file at all, just plain text.";
    const fakeFile = new File([fakeContent], "resume.pdf", { type: "application/pdf" });
    
    const formData = new FormData();
    formData.append("file", fakeFile);
    formData.append("kind", "cv");

    const req = new Request("http://localhost/api/applications/app123/documents/upload", {
      method: "POST",
      headers: { Cookie: `minerva_session=mock_token` },
      body: formData
    });

    const res = await app.handle(req);
    expect(res.status).toBe(415);
    const data = await res.json() as any;
    expect(data.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});
