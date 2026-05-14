"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { supabase } from "../../../src/lib/supabase"

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    async function logout() {
      await supabase.auth.signOut()
      router.replace("/auth/login")
      router.refresh()
    }

    logout()
  }, [router])

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-md rounded-xl border border-slate-800 p-6">
        <h1 className="text-2xl font-bold">Signing out...</h1>
        <p className="mt-2 text-slate-400">
          You will be redirected to the login page.
        </p>
      </div>
    </main>
  )
}
