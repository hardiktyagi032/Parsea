import type { CollectionConfig } from 'payload'

function isAdmin(req: any) {
  return req.user?.role === 'admin'
}

function ownsConversation(req: any, data: any) {
  return Boolean(req.user?.id && data?.owner && String(data.owner) === String(req.user.id))
}

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'owner', 'subject', 'lastMessageAt', 'updatedAt'],
  },
  access: {
    read: ({ req }) => isAdmin(req) || ownsConversation(req, (req as any).data),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => isAdmin(req) || ownsConversation(req, (req as any).data),
    delete: ({ req }) => isAdmin(req) || ownsConversation(req, (req as any).data),
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'subject', type: 'text' },
    { name: 'semester', type: 'number' },
    { name: 'messages', type: 'json', required: true, defaultValue: [] },
    { name: 'lastMessageAt', type: 'date', index: true },
  ],
}
