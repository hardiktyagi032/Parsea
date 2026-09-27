'use client'

import React, { useState, useEffect, useRef } from 'react'
import { LMSNavbar } from '@/components/LMSNavbar'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface SourceCitation {
  document: string
  chapter?: string
  page: number
  url: string
}

interface CitedImage {
  url: string
  caption: string
  page: number
  document: string
}

interface ConversationSummary {
  id: string | number
  title: string
  subject?: string
  semester?: number
  messages?: ChatMessageItem[]
  lastMessageAt?: string
}

interface ChatUser {
  id: string | number
  name?: string
  email?: string
}

interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceCitation[]
  images?: CitedImage[]
  cached?: boolean
  retrievalBypassed?: boolean
  latencyMs?: number
  timestamp: number
}

function normalizeMath(text: string): string {
  if (!text) return ''
  return (
    text
      // \[ ... \] → $$ ... $$ (display math)
      .replace(/\\\[([^]*?)\\\]/g, (_, m) => `$$${m}$$`)
      // \( ... \) → $ ... $ (inline math)
      .replace(/\\\(([^]*?)\\\)/g, (_, m) => `$${m}$`)
      // Unicode floor/ceiling brackets → LaTeX
      .replace(/⌊([^⌋]+)⌋/g, (_, m) => `$\\lfloor ${m} \\rfloor$`)
      .replace(/⌈([^⌉]+)⌉/g, (_, m) => `$\\lceil ${m} \\rceil$`)
  )
}


const QUICK_FOLLOW_UPS = [
  'Explain with a concrete example',
  'Simplify this in easy terms',
  'Give 3 exam practice questions',
  'Summarise key takeaways in a table',
]

const STARTERS = [
  'Explain pigeonhole principle with theorem statement',
  'What is the difference between relation and function?',
  'State Bayes theorem with applications',
]

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [inputQuestion, setInputQuestion] = useState('')
  const [branch, setBranch] = useState('COMPS')
  const [semester, setSemester] = useState<number | ''>(3)
  const [subject, setSubject] = useState('Discrete Mathematics')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [chatUser, setChatUser] = useState<ChatUser | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamStatus, setStreamStatus] = useState('Searching your notes...')

  useEffect(() => {
    let active = true
    const loadChatWorkspace = async () => {
      try {
        const meResponse = await fetch('/api/users/me', { credentials: 'include' })
        const meData = meResponse.ok ? await meResponse.json() : null
        if (!active) return
        const user = meData?.user ? { id: meData.user.id, name: meData.user.name, email: meData.user.email } : null
        setChatUser(user)
        if (!user) {
          const savedId = sessionStorage.getItem('parsea_conversation_id')
          if (savedId) setConversationId(savedId)
          else setConversationId(crypto.randomUUID())
          return
        }
        const historyResponse = await fetch('/api/conversations', { credentials: 'include' })
        const historyData = historyResponse.ok ? await historyResponse.json() : { conversations: [] }
        if (!active) return
        const savedConversations = historyData.conversations || []
        setConversations(savedConversations)
        const savedId = sessionStorage.getItem('parsea_conversation_id')
        if (savedId) {
          const saved = savedConversations.find((item: ConversationSummary) => String(item.id) === savedId)
          if (saved) {
            const detailResponse = await fetch(`/api/conversations/${saved.id}`, { credentials: 'include' })
            const detail = detailResponse.ok ? await detailResponse.json() : null
            if (active && detail?.conversation) {
              setConversationId(String(detail.conversation.id))
              setMessages(detail.conversation.messages || [])
            }
          }
        }
      } catch {
        if (active) setConversations([])
      } finally {
        if (active) setHistoryLoading(false)
      }
    }
    loadChatWorkspace()
    return () => { active = false }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleStartNewChat = () => {
    sessionStorage.removeItem('parsea_conversation_id')
    setConversationId('')
    setMessages([])
    setInputQuestion('')
    setHistoryOpen(false)
  }

  const handleLoadConversation = async (id: string | number) => {
    if (isStreaming) return
    const response = await fetch(`/api/conversations/${id}`, { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    const conversation = data.conversation
    setConversationId(String(conversation.id))
    sessionStorage.setItem('parsea_conversation_id', String(conversation.id))
    setMessages(conversation.messages || [])
    setHistoryOpen(false)
  }

  const handleDeleteConversation = async (id: string | number) => {
    const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) return
    setConversations((items) => items.filter((item) => String(item.id) !== String(id)))
    if (String(id) === conversationId) handleStartNewChat()
  }

  const persistConversation = async (id: string, nextMessages: ChatMessageItem[], title: string) => {
    if (!chatUser || !id) return
    const response = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, messages: nextMessages }),
    })
    if (response.ok) {
      const data = await response.json()
      setConversations((items) => [data.conversation, ...items.filter((item) => String(item.id) !== id)])
    }
  }

  const handleSendQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || isStreaming) return

    const userMessage: ChatMessageItem = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }
    let currentConvId = conversationId
    let persistedConversation = Boolean(chatUser && conversationId && !conversationId.includes('-'))
    if (!currentConvId && chatUser) {
      const createResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: trimmed, subject, semester, messages: [userMessage] }),
      })
      if (createResponse.ok) {
        const createData = await createResponse.json()
        currentConvId = String(createData.conversation.id)
        persistedConversation = true
        setConversations((items) => [createData.conversation, ...items])
      }
    }
    if (!currentConvId) currentConvId = crypto.randomUUID()
    if (!conversationId) {
      setConversationId(currentConvId)
      sessionStorage.setItem('parsea_conversation_id', currentConvId)
    }

    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessageItem = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    const updatedMessages = [...messages, userMessage]
    setMessages([...updatedMessages, assistantMessage])
    setInputQuestion('')
    setIsStreaming(true)
    setStreamStatus('Searching your notes...')

    const filters = {
      ...(branch.trim() ? { branch: branch.trim() } : {}),
      ...(semester ? { semester: Number(semester) } : {}),
      ...(subject.trim() ? { subject: subject.trim() } : {}),
    }
    const historyPayload = updatedMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const updateAssistant = (patch: Partial<ChatMessageItem>) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, ...patch } : message
        )
      )
    }

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          conversationId: currentConvId,
          history: historyPayload,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || 'Failed to start the response stream.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedContent = ''
      let completedAssistant: ChatMessageItem | null = null

      const processEvent = (rawEvent: string) => {
        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'))
        if (!dataLine) return
        const event = JSON.parse(dataLine.slice(5).trim())

        if (event.type === 'metadata') {
          setStreamStatus('Writing your answer...')
          updateAssistant({
            sources: event.sources,
            images: event.images,
            cached: event.cached,
            retrievalBypassed: event.retrievalBypassed,
          })
        } else if (event.type === 'token') {
          streamedContent += event.token || ''
          updateAssistant({ content: streamedContent })
        } else if (event.type === 'done') {
          completedAssistant = {
            ...assistantMessage,
            content: event.answer || streamedContent,
            sources: event.sources,
            images: event.images,
            cached: event.cached,
            retrievalBypassed: event.retrievalBypassed,
            latencyMs: event.latencyMs,
          }
          updateAssistant(completedAssistant)
        } else if (event.type === 'error') {
          throw new Error(event.error || 'The AI response stream failed.')
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        events.forEach(processEvent)
        if (done) break
      }
      if (buffer.trim()) processEvent(buffer)
      if (persistedConversation && completedAssistant) {
        await persistConversation(currentConvId, [...updatedMessages, completedAssistant], trimmed)
      }
    } catch (err: any) {
      updateAssistant({
        content: `**Error:** ${err?.message || 'Failed to generate response. Please try again.'}`,
      })
    } finally {
      setIsStreaming(false)
      setStreamStatus('Searching your notes...')
    }
  }
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSendQuery(inputQuestion)
  }

  const isPending = isStreaming
  const lastIsAssistant =
    !isPending && messages.length > 0 && messages[messages.length - 1].role === 'assistant'

  return (
    <div className="chat-shell">
      <LMSNavbar branch={branch} semester={semester || 3} />

      <div className="chat-workspace">
        <aside className={`chat-history-sidebar${historyOpen ? ' is-open' : ''}`}>
          <div className="chat-sidebar-head">
            <div>
              <span className="chat-sidebar-kicker">PARSEA</span>
              <h2>Conversations</h2>
            </div>
            <button type="button" className="chat-sidebar-close" onClick={() => setHistoryOpen(false)} aria-label="Close chat history">×</button>
          </div>
          <button type="button" className="chat-new-button" onClick={handleStartNewChat}>
            <span aria-hidden="true">+</span> New chat
          </button>
          {chatUser ? (
            <div className="chat-history-list">
              <span className="chat-history-label">Recent</span>
              {historyLoading ? <p className="chat-history-empty">Loading history...</p> : conversations.length === 0 ? <p className="chat-history-empty">Your saved conversations will appear here.</p> : conversations.map((conversation) => (
                <div key={conversation.id} className={`chat-history-item${String(conversation.id) === conversationId ? ' active' : ''}`}>
                  <button type="button" className="chat-history-open" onClick={() => handleLoadConversation(conversation.id)}>
                    <span className="chat-history-icon" aria-hidden="true">◌</span>
                    <span className="chat-history-title">{conversation.title}</span>
                  </button>
                  <button type="button" className="chat-history-delete" onClick={() => handleDeleteConversation(conversation.id)} aria-label={`Delete ${conversation.title}`}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="chat-history-signin">
              <p>Sign in to save conversations and continue them on another device.</p>
              <a href="/login">Sign in</a>
            </div>
          )}
        </aside>
        {historyOpen && <button type="button" className="chat-sidebar-backdrop" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" />}
        <div className="chat-main">
          <button type="button" className="chat-history-toggle" onClick={() => setHistoryOpen(true)} aria-label="Open chat history">
            <span aria-hidden="true">☰</span> History
          </button>

      {/* Message feed */}
      <div className="chat-body">
        {/* ── Academic scope filters ─────────────────────────────── */}
        <div>
          <button
            type="button"
            className="chat-filters-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <span>{showFilters ? '▼' : '▶'}</span>
            <span>
              Scope: {branch} · Sem {semester || '?'} · {subject || 'All Subjects'}
            </span>
          </button>

          {showFilters && (
            <div className="chat-filters-panel">
              <div className="form-group">
                <label className="chat-filters-label">Branch / Dept</label>
                <input
                  type="text"
                  className="form-input"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. COMPS, IT"
                />
              </div>
              <div className="form-group">
                <label className="chat-filters-label">Semester</label>
                <input
                  type="number"
                  className="form-input"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 3"
                />
              </div>
              <div className="form-group">
                <label className="chat-filters-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Discrete Mathematics"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Starter / empty state ─────────────────────────────── */}
        {messages.length === 0 && (
          <div className="chat-starters">
            <p className="chat-starters-title">Start an Academic Discussion</p>
            <p className="chat-starters-desc">
              Ask anything about your study materials. Follow-up questions reuse cached context —
              no extra database queries.
            </p>
            <div className="chat-starters-chips">
              {STARTERS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="chat-starter-chip"
                  onClick={() => handleSendQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Message thread ───────────────────────────────────── */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message-row chat-message-row--${msg.role}`}
          >
            <span className="chat-sender-label">
              {msg.role === 'user' ? 'You' : 'Parsea'}
            </span>

            {msg.role === 'user' ? (
              <div className="chat-bubble-user">{msg.content}</div>
            ) : (
              <div className="chat-card">
                {/* Status badges */}
                <div className="chat-card-header">
                  <span className="chat-card-label">Response</span>
                  <div className="chat-card-badges">
                    {msg.retrievalBypassed && (
                      <span
                        className="badge badge-blue badge-rounded"
                        title="Follow-up answered using cached context — 0 DB queries"
                      >
                        Instant
                      </span>
                    )}
                    {msg.cached && (
                      <span className="badge badge-green badge-rounded">Cached</span>
                    )}
                    {msg.latencyMs !== undefined && (
                      <span className="text-muted text-xs">
                        {(msg.latencyMs / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Markdown + KaTeX */}
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {normalizeMath(msg.content)}
                  </ReactMarkdown>
                </div>

                {/* Diagrams */}
                {msg.images && msg.images.length > 0 && (
                  <div className="chat-section">
                    <span className="chat-section-title">
                      Extracted diagrams ({msg.images.length})
                    </span>
                    <div className="chat-img-grid">
                      {msg.images.map((img, i) => (
                        <div key={i} className="chat-img-card">
                          <div
                            className="chat-img-preview"
                            onClick={() => setSelectedImage(img.url)}
                          >
                            <img src={img.url} alt={img.caption} />
                            <span className="chat-img-page-badge">Pg {img.page}</span>
                          </div>
                          <div className="chat-img-caption">{img.caption}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="chat-section">
                    <span className="chat-section-title">Citations</span>
                    <div className="chat-sources-grid">
                      {msg.sources.map((s, i) => (
                        <div key={i} className="chat-source-item">
                          <div className="chat-source-info">
                            <span className="chat-source-name">{s.document}</span>
                            <span className="chat-source-detail">
                              {s.chapter ? `${s.chapter} · ` : ''}
                              <span className="chat-source-page">Page {s.page}</span>
                            </span>
                          </div>
                          {s.url && (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-primary btn-sm"
                              style={{ flexShrink: 0 }}
                            >
                              PDF ↗
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isPending && (
          <div className="chat-loading-bubble">
            <div className="spinner" />
            <span>{streamStatus}</span>
          </div>
        )}

        {/* Quick follow-up chips */}
        {lastIsAssistant && (
          <div className="chat-followups">
            <span className="chat-followup-label">Follow-up:</span>
            {QUICK_FOLLOW_UPS.map((chip, i) => (
              <button
                key={i}
                type="button"
                className="chat-followup-chip"
                onClick={() => handleSendQuery(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Sticky input bar ─────────────────────────────────────── */}
      <div className="chat-input-bar">
        <form onSubmit={handleSubmit} className="chat-input-inner">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleStartNewChat}
            title="Start a new conversation thread"
            style={{ flexShrink: 0 }}
          >
            New chat
          </button>

          <input
            type="text"
            className="form-input"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder={
              messages.length === 0
                ? "Ask anything — e.g. 'explain pigeonhole principle with diagrams'…"
                : "Ask a follow-up — reuses cached context, no extra DB query…"
            }
            disabled={isPending}
            style={{ flex: 1 }}
          />

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || !inputQuestion.trim()}
            style={{ flexShrink: 0 }}
          >
            {isPending ? (
              <>
                <span className="btn-spinner" />
                Sending…
              </>
            ) : (
              'Send →'
            )}
          </button>
        </form>
      </div>

      {/* Diagram zoom overlay */}
      {selectedImage && (
        <div className="zoom-overlay" onClick={() => setSelectedImage(null)}>
          <div>
            <img src={selectedImage} alt="Expanded diagram" className="zoom-img" />
            <p className="zoom-hint">Click anywhere to close</p>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
