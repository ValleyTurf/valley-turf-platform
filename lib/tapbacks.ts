// Recognizes a "tapback" that arrived as an ordinary text (ROADMAP "Top
// 10 (November 2026)" #9). When an iPhone or Android user long-presses
// one of our texts and taps a reaction, a non-iMessage number like ours
// doesn't get a reaction -- it gets a whole new text reading
//
//     Liked "Hi Tina, it won't be a problem getting you in the second..."
//
// quoting our own message back in full. In the inbox that looked like a
// new customer message needing a reply, and it buzzed everyone's phone
// (Tina Aghassi, 2026-11-13). Detected here so the Twilio webhook can
// file it as what it is: a reaction, already read, no notification.
//
// Pure -- no imports -- so the patterns can be checked on their own.

export type Tapback = {
  // "Liked", "Loved", ... or "Reacted" for a free-choice emoji.
  verb: string;
  emoji: string;
  // The message being reacted to, as quoted back to us.
  quoted: string;
  // True for "Removed a like from ..." -- taking a reaction back.
  removed: boolean;
};

const CLASSIC: Record<string, string> = {
  liked: "👍",
  loved: "❤️",
  disliked: "👎",
  "laughed at": "😂",
  emphasized: "‼️",
  questioned: "❓",
};

const REMOVED: Record<string, { verb: string; emoji: string }> = {
  like: { verb: "Liked", emoji: "👍" },
  heart: { verb: "Loved", emoji: "❤️" },
  dislike: { verb: "Disliked", emoji: "👎" },
  laugh: { verb: "Laughed at", emoji: "😂" },
  exclamation: { verb: "Emphasized", emoji: "‼️" },
  "question mark": { verb: "Questioned", emoji: "❓" },
};

// Curly or straight double quotes on either end -- phones differ.
const OPEN = "[“\"]";
const CLOSE = "[”\"]";

export function parseTapback(body: string | null | undefined): Tapback | null {
  if (!body) return null;

  // Android wraps its emoji in zero-width spaces; drop those and
  // trailing whitespace before matching.
  const text = body.replace(/[​‌‍﻿]/g, "").trim();

  const classic = text.match(
    new RegExp(
      `^(Liked|Loved|Disliked|Laughed at|Emphasized|Questioned)\\s+${OPEN}([\\s\\S]*)${CLOSE}$`,
      "i"
    )
  );

  if (classic) {
    const verb = classic[1].toLowerCase();

    return {
      verb: classic[1].charAt(0).toUpperCase() + classic[1].slice(1).toLowerCase(),
      emoji: CLASSIC[verb],
      quoted: classic[2].trim(),
      removed: false,
    };
  }

  const removed = text.match(
    new RegExp(
      `^Removed an? (like|heart|dislike|laugh|exclamation|question mark) from\\s+${OPEN}([\\s\\S]*)${CLOSE}$`,
      "i"
    )
  );

  if (removed) {
    const entry = REMOVED[removed[1].toLowerCase()];

    return { verb: entry.verb, emoji: entry.emoji, quoted: removed[2].trim(), removed: true };
  }

  // "Reacted 👍 to "..."" (newer iOS) and "👍 to "..."" (Android). The
  // reaction is one short run of non-space characters with no letters
  // or digits in it, so an ordinary sentence that happens to contain
  // ` to "` can't match.
  const emoji = text.match(
    new RegExp(`^(?:Reacted\\s+)?(\\S{1,12})\\s+to\\s+${OPEN}([\\s\\S]*)${CLOSE}$`, "i")
  );

  if (emoji && !/[\p{L}\p{N}]/u.test(emoji[1])) {
    return { verb: "Reacted", emoji: emoji[1], quoted: emoji[2].trim(), removed: false };
  }

  return null;
}

const QUOTE_PREVIEW_LENGTH = 70;

// One compact line for the inbox and the customer's contact history:
//   👍 Liked "Hi Tina, it won't be a problem getting you in the second…"
export function describeTapback(tapback: Tapback): string {
  const quote =
    tapback.quoted.length > QUOTE_PREVIEW_LENGTH
      ? `${tapback.quoted.slice(0, QUOTE_PREVIEW_LENGTH).trimEnd()}…`
      : tapback.quoted;

  if (tapback.removed) {
    return `Removed their ${tapback.emoji} from "${quote}"`;
  }

  return tapback.verb === "Reacted"
    ? `${tapback.emoji} Reacted to "${quote}"`
    : `${tapback.emoji} ${tapback.verb} "${quote}"`;
}
