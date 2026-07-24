"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F6F2] p-8">
      <div className="w-full max-w-sm rounded-2xl border border-[#D9E4D4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#0E3B2E]">
          Valley Turf Revival
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="username"
            className="w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
            autoFocus
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-[#D9E4D4] p-3 outline-none focus:border-[#D4A32A]"
          />

          {error && (
            <p className="text-sm font-semibold text-red-600">
              Incorrect email or password.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#0E3B2E] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#2E6B3F]"
          >
            Log In
          </button>
        </form>
      </div>
    </main>
  );
}
