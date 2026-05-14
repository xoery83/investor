import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type AppUserRole = "admin" | "free" | "plus" | "pro"

export type AppUserProfile = {
  id: string
  email: string | null
  display_name: string | null
  role: AppUserRole
  plan_status: string
}

export type RequestUser = {
  id: string
  email: string | null
  profile: AppUserProfile
}

export const serverSupabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getRequestUser(request: Request) {
  const token = getBearerToken(request)
  if (!token) return null

  const { data, error } = await serverSupabase.auth.getUser(token)

  if (error || !data.user) return null

  const user = data.user
  const email = user.email || null
  const displayName =
    readString(user.user_metadata?.full_name) ||
    readString(user.user_metadata?.name) ||
    email

  const { data: profile } = await serverSupabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile) {
    return {
      id: user.id,
      email,
      profile: profile as AppUserProfile,
    } satisfies RequestUser
  }

  const { data: createdProfile } = await serverSupabase
    .from("user_profiles")
    .upsert(
      {
        id: user.id,
        email,
        display_name: displayName,
        role: "free",
        plan_status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select()
    .single()

  return {
    id: user.id,
    email,
    profile: (createdProfile || {
      id: user.id,
      email,
      display_name: displayName,
      role: "free",
      plan_status: "active",
    }) as AppUserProfile,
  } satisfies RequestUser
}

export function requireRequestUser(request: Request) {
  return getRequestUser(request)
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  const [scheme, token] = authorization.split(" ")
  return scheme?.toLowerCase() === "bearer" && token ? token : null
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
