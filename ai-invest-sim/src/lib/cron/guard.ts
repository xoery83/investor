export function validateCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return {
      allowed: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    }
  }

  const authorization = request.headers.get("authorization") || ""
  const headerSecret = request.headers.get("x-cron-secret") || ""
  const url = new URL(request.url)
  const querySecret = url.searchParams.get("secret") || ""

  const allowed =
    authorization === `Bearer ${secret}` ||
    headerSecret === secret ||
    querySecret === secret

  if (!allowed) {
    return {
      allowed: false,
      status: 401,
      error: "Invalid cron secret.",
    }
  }

  return { allowed: true, status: 200, error: null }
}
