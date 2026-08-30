import { describe, expect, it } from "vitest";
import { buildChatPayload } from "./supabase";

describe("buildChatPayload", () => {
  it("serializes chat fields and trims title", () => {
    const payload = buildChatPayload({
      id: "chat-1",
      title: "  My chat  ",
      pinned: true,
      updatedAt: 1710000000000,
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          createdAt: 1710000000000,
        },
      ],
    });

    expect(payload).toMatchObject({
      id: "chat-1",
      title: "My chat",
      pinned: true,
      updated_at: new Date(1710000000000).toISOString(),
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          created_at: new Date(1710000000000).toISOString(),
        },
      ],
    });
  });
});
