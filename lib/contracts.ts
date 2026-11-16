import { z } from "zod";
export const commandInput = z
  .object({
    action: z.enum([
      "soloStart",
      "soloGuess",
      "soloSkip",
      "soloNext",
      "soloFinish",
      "dailyGuess",
      "skip",
      "create",
      "join",
      "heartbeat",
      "leave",
      "ready",
      "start",
      "remove",
      "rematch",
      "reaction",
      "partyGuess",
    ]),
    code: z.string().trim().max(12).optional(),
    name: z.string().trim().min(1).max(24).optional(),
    rounds: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional(),
    duration: z.union([z.literal(15), z.literal(25), z.literal(40)]).optional(),
    category: z
      .enum(["All pictures", "Animals", "Food", "Objects", "Nature"])
      .optional(),
    text: z.string().max(80).optional(),
    key: z.string().uuid().optional(),
    target: z.string().max(64).optional(),
    reaction: z.string().max(8).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      [
        "dailyGuess",
        "skip",
        "partyGuess",
        "create",
        "soloStart",
        "soloGuess",
        "soloSkip",
        "soloNext",
        "soloFinish",
        "start",
      ].includes(value.action) &&
      !value.key
    )
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: "Submission key required",
      });
    if (!["dailyGuess", "skip", "create"].includes(value.action) && !value.code)
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Room code required",
      });
    if (
      value.action.startsWith("solo") &&
      !["FREE", "FLASH"].includes(value.code || "")
    )
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Choose a mode",
      });
    if (["create", "join"].includes(value.action) && !value.name)
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Name required",
      });
    if (value.action === "remove" && !value.target)
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "Player required",
      });
  });
export type CommandInput = z.infer<typeof commandInput>;
