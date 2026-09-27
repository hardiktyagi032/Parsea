import { NextResponse } from 'next/server'
import { Groq, toFile } from 'groq-sdk'

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
    const file = await toFile(buffer, audioFile.name || 'speech.webm', {
      type: audioFile.type || 'audio/webm',
    })

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      response_format: 'verbose_json',
    })

    return NextResponse.json({
      text: transcription.text || '',
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