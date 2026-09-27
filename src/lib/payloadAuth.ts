import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

let payloadPromise: Promise<Payload> | null = null

export async function getAppPayload() {
  if (!payloadPromise) {
    payloadPromise = Promise.resolve(config).then((payloadConfig) => getPayload({ config: payloadConfig }))
  }
  return payloadPromise
}

export async function getRequestUser(req: Request) {
  const payload = await getAppPayload()
  const auth = await payload.auth({ headers: req.headers })
  return { payload, user: auth.user }
}

export function isAdminUser(user: any) {
  return user?.role === 'admin'
}
