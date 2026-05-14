"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Provider } from "@supabase/supabase-js"

import { supabase } from "../../../src/lib/supabase"

const oauthProviders: { provider: Provider; label: string }[] = [
  { provider: "google", label: "Continue with Google" },
  { provider: "facebook", label: "Continue with Facebook" },
]

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-8 text-white">
          Loading...
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") || "/agents"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(nextPath)
    })
  }, [nextPath, router])

  async function signInWithOAuth(provider: Provider) {
    setError("")
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: provider === "facebook" ? "public_profile" : undefined,
      },
    })

    if (authError) setError(authError.message)
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    setNotice("")

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
          })

    setLoading(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (mode === "signup" && !result.data.session) {
      setNotice("Check your email to confirm the account, then log in.")
      return
    }

    router.replace(nextPath)
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-md rounded-xl border border-slate-800 p-6">
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-slate-400">
          Log in to create private agents and manage your portfolio workspace.
        </p>

        <div className="mt-6 space-y-3">
          {oauthProviders.map((item) => (
            <button
              key={item.provider}
              type="button"
              onClick={() => signInWithOAuth(item.provider)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-left hover:bg-slate-800"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          Email
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2"
              required
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-blue-800 bg-blue-950 p-3 text-sm text-blue-200">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 hover:bg-blue-700 disabled:bg-slate-700"
          >
            {loading
              ? "Working..."
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 text-sm text-blue-400 hover:text-blue-300"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>
    </main>
  )
}
