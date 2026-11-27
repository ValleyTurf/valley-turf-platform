import { describe, expect, it } from "vitest";
import { isPushKind, pushKindsForRole, shouldReceivePush } from "./pushKinds";
import { parseTapback, describeTapback } from "./tapbacks";

describe("pushKinds", () => {
  // Each check reads as one test. The expected value is compared with
  // toEqual, so objects and arrays compare by content.
  function t(name: string, got: unknown, want: unknown) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  // real examples from Ryan's inbox
  let tb = parseTapback("Liked “Hi Tina, it won't be a problem getting you in the second week of December. As I finalize the schedule I will work with you on a date/time that works for you.”");
  t("liked verb", [tb?.verb, tb?.emoji, tb?.removed], ["Liked", "👍", false]);
  t("liked describe", describeTapback(tb!), "👍 Liked \"Hi Tina, it won't be a problem getting you in the second week of Decem…\"");
  tb = parseTapback("Loved “OK, I will take out this visit, and we will be back out in January.”");
  t("loved", [tb?.verb, tb?.emoji], ["Loved", "❤️"]);
  tb = parseTapback("​👍​ to “ Thanks again for letting us come out to clean your turf today. ”");
  t("android emoji", [tb?.verb, tb?.emoji, tb?.quoted], ["Reacted", "👍", "Thanks again for letting us come out to clean your turf today."]);
  t("android describe", describeTapback(tb!), "👍 Reacted to \"Thanks again for letting us come out to clean your turf today.\"");
  t("reacted ios18", parseTapback("Reacted 🎉 to “See you Friday”")?.emoji, "🎉");
  t("straight quotes", parseTapback('Laughed at "that gate again"')?.emoji, "😂");
  t("emphasized", parseTapback("Emphasized “Please lock the gate”")?.emoji, "‼️");
  t("removed", [parseTapback("Removed a like from “See you Friday”")?.removed, describeTapback(parseTapback("Removed a like from “See you Friday”")!)], [true, 'Removed their 👍 from "See you Friday"']);
  t("removed an exclamation", parseTapback("Removed an exclamation from “Hi”")?.verb, "Emphasized");
  // must NOT match ordinary messages
  t("plain", parseTapback("Sounds good thank you!"), null);
  t("starts with Liked but no quote", parseTapback("Liked the job you guys did!"), null);
  t("sentence with to-quote", parseTapback('Can you come to "the back gate" instead'), null);
  t("word before to", parseTapback('Yes to "Friday at 9"'), null);
  t("number before to", parseTapback('2 to "4pm"'), null);
  t("quote only at start", parseTapback("Liked “the service” a lot, thanks"), null);
  t("empty", parseTapback(""), null);
  t("null", parseTapback(null), null);
  t("multiline quote", parseTapback("Liked “line one\nline two”")?.quoted, "line one\nline two");
  // push kinds
  t("staff gets messages", shouldReceivePush("customer_message", "staff", []), true);
  t("staff never gets payments", shouldReceivePush("payment_received", "staff", []), false);
  t("manager no payments", shouldReceivePush("payment_received", "manager", []), false);
  t("manager low rating", shouldReceivePush("low_rating", "manager", []), true);
  t("admin payments default on", shouldReceivePush("payment_received", "admin", null), true);
  t("admin turned off", shouldReceivePush("payment_received", "admin", ["payment_received"]), false);
  t("other disabled doesn't affect", shouldReceivePush("missed_call", "admin", ["payment_received"]), true);
  t("no role", shouldReceivePush("customer_message", null, []), false);
  t("kinds for staff", pushKindsForRole("staff").map(k => k.kind), ["customer_message", "unknown_sender", "missed_call"]);
  t("kinds for admin count", pushKindsForRole("admin").length, 9);
  t("new lead push roles", [shouldReceivePush("new_lead", "admin", []), shouldReceivePush("new_lead", "manager", []), shouldReceivePush("new_lead", "staff", [])], [true, true, false]);
  t("isPushKind", [isPushKind("low_rating"), isPushKind("nope")], [true, false]);
});
