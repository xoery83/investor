import { NextResponse } from "next/server"

import { getRequestUser } from "../../../../src/lib/auth/server"

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
