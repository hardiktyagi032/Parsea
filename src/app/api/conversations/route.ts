import { NextResponse } from 'next/server'
import { getRequestUser, isAdminUser } from '@/lib/payloadAuth'

export async function GET(req: Request) {
  try {
    const { payload, user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    const url = new URL(req.url)
    const owner = isAdminUser(user) && url.searchParams.get('all') === 'true' ? undefined : user.id
    const result = await payload.find({ collection: 'conversations', where: owner ? { owner: { equals: owner } } : undefined, depth: 0, limit: 100, sort: '-lastMessageAt', overrideAccess: true })
    return NextResponse.json({ conversations: result.docs })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load conversations.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { payload, user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    const body = await req.json()
    const conversation = await payload.create({ collection: 'conversations', data: { owner: user.id, title: String(body.title || 'New conversation').slice(0, 120), subject: body.subject ? String(body.subject) : undefined, semester: body.semester ? Number(body.semester) : undefined, messages: Array.isArray(body.messages) ? body.messages : [], lastMessageAt: new Date().toISOString() }, overrideAccess: true })
    return NextResponse.json({ conversation }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to create conversation.' }, { status: 500 })
  }
}
