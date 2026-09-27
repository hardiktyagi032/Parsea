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


const VOICE_OPTIONS = [
  { id: 'auto', label: 'Auto (Hindi / English)' },
  { id: 'hi-IN-SwaraNeural', label: 'Hindi - Swara (Female)' },
  { id: 'hi-IN-MadhurNeural', label: 'Hindi - Madhur (Male)' },
  { id: 'en-IN-NeerjaNeural', label: 'English (IN) - Neerja (Female)' },
  { id: 'en-IN-PrabhatNeural', label: 'English (IN) - Prabhat (Male)' },
  { id: 'en-US-JennyNeural', label: 'English (US) - Jenny (Female)' },
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

  
  // Voice States
  const [selectedVoice, setSelectedVoice] = useState<string>('auto')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [loadingTTSId, setLoadingTTSId] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('parsea_voice')
    if (saved) setSelectedVoice(saved)
  }, [])

  const handleVoiceChange = (v: string) => {
    setSelectedVoice(v)
    localStorage.setItem('parsea_voice', v)
  }

  // Mic Recording (MediaRecorder STT)
  const startRecording = async () => {
    setVoiceError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        await processAudioTranscription(audioBlob)
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch (err: any) {
      console.error('Microphone error:', err)
      setVoiceError('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const processAudioTranscription = async (blob: Blob) => {
    setIsTranscribing(true)
    setVoiceError(null)
    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')

      const res = await fetch('/api/voice/stt', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Speech transcription failed')
      }

      if (data.text) {
        setInputQuestion(data.text)
      }
    } catch (err: any) {
      console.error('STT Error:', err)
      setVoiceError(err?.message || 'Error processing speech transcription')
    } finally {
      setIsTranscribing(false)
    }
  }

  // Text-to-Speech (TTS)
  const handlePlayTTS = async (msgId: string, text: string) => {
    if (playingMessageId === msgId) {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
      }
      setPlayingMessageId(null)
      return
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause()
    }

    setLoadingTTSId(msgId)
    setPlayingMessageId(null)
    setVoiceError(null)

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: selectedVoice }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'TTS synthesis failed')
      }

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      const audio = new Audio(audioUrl)
      audioElementRef.current = audio

      audio.onended = () => {
        setPlayingMessageId(null)
      }

      audio.onerror = () => {
        setPlayingMessageId(null)
        setVoiceError('Failed to play synthesized audio')
      }

      await audio.play()
      setPlayingMessageId(msgId)
    } catch (err: any) {
      console.error('TTS Error:', err)
      setVoiceError(err?.message || 'Error generating voice response')
    } finally {
      setLoadingTTSId(null)
    }
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamStatus, setStreamStatus] = useState('Searching your notes...')

  useEffect(() => {
    const savedId = sessionStorage.getItem('parsea_conversation_id')
    if (savedId) {
      setConversationId(savedId)
    } else {
      const newId = crypto.randomUUID()
      sessionStorage.setItem('parsea_conversation_id', newId)
      setConversationId(newId)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleStartNewChat = () => {
    const newId = crypto.randomUUID()
    sessionStorage.setItem('parsea_conversation_id', newId)
    setConversationId(newId)
    setMessages([])
    setInputQuestion('')
  }

  const handleSendQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || isStreaming) return

    const currentConvId = conversationId || crypto.randomUUID()
    if (!conversationId) {
      setConversationId(currentConvId)
      sessionStorage.setItem('parsea_conversation_id', currentConvId)
    }

    const userMessage: ChatMessageItem = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
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
          updateAssistant({
            content: event.answer || streamedContent,
            sources: event.sources,
            images: event.images,
            cached: event.cached,
            retrievalBypassed: event.retrievalBypassed,
            latencyMs: event.latencyMs,
          })
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
                  <div className="chat-card-badges" style={{ alignItems: 'center' }}>

                    {/* TTS Speaker Button */}
                    <button
                      type="button"
                      onClick={() => handlePlayTTS(msg.id, msg.content)}
                      title={playingMessageId === msg.id ? 'Pause Voice' : 'Read aloud with Edge-TTS'}
                      disabled={loadingTTSId === msg.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        borderRadius: 6,
                        border: '1px solid var(--border-default)',
                        background: playingMessageId === msg.id ? 'var(--green-100)' : 'var(--bg-surface)',
                        color: playingMessageId === msg.id ? 'var(--green-800)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        marginRight: 6,
                      }}
                    >
                      {loadingTTSId === msg.id ? (
                        <span>⏳ Synthesizing...</span>
                      ) : playingMessageId === msg.id ? (
                        <span>🔊 Pause ⏸️</span>
                      ) : (
                        <span>🔊 Listen</span>
                      )}
                    </button>

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
            disabled={isPending || isTranscribing}
            style={{ flex: 1 }}
          />

          
          {/* Microphone Recording Toggle Button */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isPending || isTranscribing}
            title={isRecording ? 'Stop Recording' : 'Voice Input (Groq Whisper STT)'}
            style={{
              flexShrink: 0,
              padding: '0 12px',
              height: 38,
              borderRadius: 8,
              border: isRecording ? '1px solid #ef5350' : '1px solid var(--border-default)',
              background: isRecording ? '#ffebee' : 'var(--bg-surface)',
              color: isRecording ? '#d32f2f' : 'var(--text-primary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {isTranscribing ? (
              <span>⏳</span>
            ) : isRecording ? (
              <>
                <span style={{ color: '#d32f2f' }}>🔴</span>
                <span>Stop</span>
              </>
            ) : (
              <span>🎙️</span>
            )}
          </button>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || !inputQuestion.trim() || isTranscribing}
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
  )
}
