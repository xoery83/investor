"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { supabase } from "../../../src/lib/supabase"

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-8 text-white">
          Finishing login...
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  )
}

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState("")

  useEffect(() => {
    async function finishAuth() {
      const code = searchParams.get("code")
      const nextPath =
        searchParams.get("next") ||
        window.localStorage.getItem("auth:next") ||
        "/agents"

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
      }

      window.localStorage.removeItem("auth:next")
      router.replace(nextPath)
      router.refresh()
    }

    finishAuth()
  }, [router, searchParams])

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-md rounded-xl border border-slate-800 p-6">
        <h1 className="text-2xl font-bold">Finishing login...</h1>
        {error && (
          <p className="mt-4 rounded-lg border border-red-800 bg-red-950 p-3 text-red-300">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
