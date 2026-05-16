import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DAILY_API = "https://api.daily.co/v1";

const createRoomInput = z.object({
  prefix: z.string().min(1).max(40).default("ditm"),
  expiresInMinutes: z.number().int().min(5).max(60 * 24).default(180),
});

export const createDailyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createRoomInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) throw new Error("DAILY_API_KEY is not configured");

    const exp = Math.floor(Date.now() / 1000) + data.expiresInMinutes * 60;
    const name = `${data.prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    const res = await fetch(`${DAILY_API}/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        privacy: "public",
        properties: {
          exp,
          enable_chat: true,
          enable_screenshare: true,
          enable_prejoin_ui: false,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Daily room create failed [${res.status}]: ${txt}`);
    }
    const room = (await res.json()) as { name: string; url: string };
    return { name: room.name, url: room.url };
  });
