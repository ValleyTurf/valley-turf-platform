"use client";

// Client component for two reasons, same as AddVisitNoteForm.tsx /
// VisitNoteForm.tsx: (1) a failed submit needs somewhere to show up
// in-place rather than a full page reload; (2) photos have to upload
// directly from the browser to Supabase Storage BEFORE calling
// submitQuoteRequest — routing raw file bytes through the server action
// itself would hit Vercel's ~4.5MB body cap, which a single phone photo
// can exceed alone. See lib/leadPhotoUploadAction.ts.
//
// draftId is minted once per form load and used as the storage folder for
// any photos uploaded before the lead row exists yet (the leads.id isn't
// known until after submit) — same "upload first, attach after" shape as
// the visit-notes flow, just with a client-generated id instead of an
// existing visit id standing in for the folder name.
import { useState, useTransition } from "react";
import { submitQuoteRequest } from "./actions";
import { uploadLeadPhotosFromBrowser } from "@/lib/uploadLeadPhotosClient";

const SQFT_OPTIONS = [
  "<300",
  "300-500",
  "500-750",
  "750-1000",
  "1000-1250",
  "1250-1500",
  "1500-1750",
  "1750-2000",
  "2000-2250",
  "2250-2500",
  "2500-2750",
  "2750-3000",
  ">3000",
];

const inputClasses =
  "mt-1 block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";
const labelClasses = "text-sm font-semibold text-[#6b705c]";

export default function RequestQuoteForm() {
  const [draftId] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const fileInput = form.elements.namedItem("photos");
    const files =
      fileInput instanceof HTMLInputElement && fileInput.files
        ? Array.from(fileInput.files)
        : [];

    startTransition(async () => {
      let photoPaths: string[] = [];

      if (files.length > 0) {
        setUploadStatus(
          files.length === 1 ? "Uploading photo…" : `Uploading ${files.length} photos…`
        );

        const upload = await uploadLeadPhotosFromBrowser(draftId, files);
        setUploadStatus(null);

        if (upload.paths.length === 0 && upload.error) {
          setError(`Photo upload failed: ${upload.error}`);
          return;
        }

        photoPaths = upload.paths;
      }

      const result = await submitQuoteRequest({
        fullName: String(formData.get("fullName") || ""),
        email: String(formData.get("email") || ""),
        phone: String(formData.get("phone") || ""),
        street: String(formData.get("street") || ""),
        city: String(formData.get("city") || ""),
        state: String(formData.get("state") || "AZ"),
        zip: String(formData.get("zip") || ""),
        turfSizeRange: String(formData.get("turfSizeRange") || ""),
        notes: String(formData.get("notes") || ""),
        photoPaths,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-800">Request received!</p>
        <p className="mt-2 text-sm text-green-800">
          Thanks for reaching out. We&apos;ll follow up with a quote soon —
          usually within one business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="fullName" className={labelClasses}>
          Full Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          placeholder="Jane Smith"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClasses}>
          Email (optional)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="jane@example.com"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClasses}>
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="(555) 555-5555"
          className={inputClasses}
        />
        <p className="mt-1.5 text-xs text-[#6b705c]">
          By providing your phone number, you agree to receive Visit
          Reminders and other transactional text messages (SMS) from Valley
          Turf Revival. You can unsubscribe at any time by replying STOP.
          Message and data rates may apply. Message frequency varies. Reply
          HELP for help or STOP to cancel.
        </p>
      </div>

      <fieldset>
        <legend className={labelClasses}>Service Address</legend>

        <div className="mt-1 space-y-3">
          <input
            name="street"
            type="text"
            required
            placeholder="Street address"
            className={inputClasses}
          />

          <div className="grid grid-cols-3 gap-3">
            <input
              name="city"
              type="text"
              required
              placeholder="City"
              className={`${inputClasses} col-span-2`}
            />
            <input
              name="zip"
              type="text"
              required
              inputMode="numeric"
              placeholder="Zip"
              className={inputClasses}
            />
          </div>

          <input
            name="state"
            type="text"
            defaultValue="AZ"
            maxLength={2}
            className={`${inputClasses} w-20 uppercase`}
          />
        </div>
      </fieldset>

      <div>
        <label htmlFor="turfSizeRange" className={labelClasses}>
          Approximate Square Footage
        </label>
        <select
          id="turfSizeRange"
          name="turfSizeRange"
          required
          defaultValue=""
          className={`${inputClasses} bg-white`}
        >
          <option value="" disabled>
            Select one
          </option>
          <option value="Not sure">Not sure</option>
          {SQFT_OPTIONS.map((range) => (
            <option key={range} value={range}>
              {range} sq ft
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="notes" className={labelClasses}>
          Anything else we should know? (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Pet odor, staining, a specific area to focus on, etc."
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="photos" className={labelClasses}>
          Photos (optional)
        </label>
        <input
          id="photos"
          type="file"
          name="photos"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-xs text-[#6b705c] file:mr-3 file:rounded-lg file:border-0 file:bg-[#174734] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {uploadStatus ?? (isPending ? "Submitting…" : "Request My Quote")}
      </button>

      {error && (
        <p className="text-sm font-semibold text-red-600">{error}</p>
      )}
    </form>
  );
}
