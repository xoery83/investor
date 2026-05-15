import { NextResponse } from "next/server"

import {
  clearRequestUserCache,
  getRequestUser,
  serverSupabase,
} from "../../../../src/lib/auth/server"

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  return NextResponse.json({
    success: true,
    user: {
      id: requestUser.id,
      email: requestUser.email,
      profile: requestUser.profile,
    },
  })
}

export async function PATCH(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const displayName = String(body.display_name || "").trim()

  if (displayName.length < 2 || displayName.length > 40) {
    return NextResponse.json(
      {
        success: false,
        error: "Display name must be between 2 and 40 characters.",
      },
      { status: 400 }
    )
  }

  const { data, error } = await serverSupabase
    .from("user_profiles")
    .upsert(
      {
        id: requestUser.id,
        email: requestUser.email,
        display_name: displayName,
        role: requestUser.profile.role,
        plan_status: requestUser.profile.plan_status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  clearRequestUserCache(request)

  return NextResponse.json({
    success: true,
    user: {
      id: requestUser.id,
      email: requestUser.email,
      profile: data,
    },
  })
}
