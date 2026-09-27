import { NextResponse } from 'next/server'
import { getRequestUser, isAdminUser } from '@/lib/payloadAuth'

async function getOwnedConversation(req: Request, id: string) {
  const { payload, user } = await getRequestUser(req)
  if (!user) return { payload, user, conversation: null }
  const conversation = await payload.findByID({ collection: 'conversations', id, depth: 0, overrideAccess: true })
  const ownerId = typeof conversation.owner === 'object' ? conversation.owner.id : conversation.owner
  if (!isAdminUser(user) && String(ownerId) !== String(user.id)) return { payload, user, conversation: null }
  return { payload, user, conversation }
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const { user, conversation } = await getOwnedConversation(req, id); if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 }); if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }); return NextResponse.json({ conversation }) } catch (error: any) { return NextResponse.json({ error: error?.message || 'Unable to load conversation.' }, { status: 500 }) }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const { payload, user, conversation } = await getOwnedConversation(req, id); if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 }); if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }); const body = await req.json(); const data: Record<string, unknown> = { lastMessageAt: new Date().toISOString() }; if (typeof body.title === 'string') data.title = body.title.slice(0, 120); if (Array.isArray(body.messages)) data.messages = body.messages.slice(-100); const updated = await payload.update({ collection: 'conversations', id, data, overrideAccess: true }); return NextResponse.json({ conversation: updated }) } catch (error: any) { return NextResponse.json({ error: error?.message || 'Unable to save conversation.' }, { status: 500 }) }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const { payload, user, conversation } = await getOwnedConversation(req, id); if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 }); if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }); await payload.delete({ collection: 'conversations', id, overrideAccess: true }); return NextResponse.json({ success: true }) } catch (error: any) { return NextResponse.json({ error: error?.message || 'Unable to delete conversation.' }, { status: 500 }) }
}
