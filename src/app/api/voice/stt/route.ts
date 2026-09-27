import { NextResponse } from 'next/server'
import { Groq, toFile } from 'groq-sdk'

const HALLUCINATION_ARTIFACTS = [
  'thank you.',
  'thank you',
  'you',
  'subtitles by',
  'subtitles by...',
  'thanks for watching',
  'subscribe',
  'amara.org',
]

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        { error: 'Error: Please set GROQ_API_KEY in your .env file' },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const audioFile = (formData.get('file') || formData.get('audio')) as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    const groq = new Groq({ apiKey })

    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = audioFile.name || 'speech.webm'
    const fileType = audioFile.type || 'audio/webm'

    const file = await toFile(buffer, fileName, { type: fileType })

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      temperature: 0.0,
      prompt: 'User speaking a clear query or question in English, Hindi, or Hinglish.',
      response_format: 'verbose_json',
    })

    let text = (transcription.text || '').trim()
    const lowerText = text.toLowerCase()

    if (
      HALLUCINATION_ARTIFACTS.some(
        (artifact) => lowerText === artifact || lowerText.startsWith(artifact)
      )
    ) {
      text = ''
    }

    return NextResponse.json({
      text,
      language: (transcription as any).language || 'auto',
    })
  } catch (error: any) {
    console.error('STT Route Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to process audio' },
      { status: 500 }
    )
  }
}