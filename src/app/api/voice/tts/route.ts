import { NextResponse } from 'next/server'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export async function POST(req: Request) {
  try {
    const { text, voice = 'auto' } = await req.json()

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required for speech synthesis' }, { status: 400 })
    }

    let selectedVoice = voice
    if (selectedVoice === 'auto' || !selectedVoice) {
      const isDevanagari = /[\u0900-\u097F]/.test(text)
      selectedVoice = isDevanagari ? 'hi-IN-SwaraNeural' : 'en-IN-NeerjaNeural'
    }

    const tts = new MsEdgeTTS()
    await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const streamResult = tts.toStream(text)
    const audioStream = (streamResult as any).audioStream || streamResult

    const webStream = new ReadableStream({
      start(controller) {
        audioStream.on('data', (chunk: Buffer) => controller.enqueue(chunk))
        audioStream.on('end', () => controller.close())
        audioStream.on('error', (err: any) => controller.error(err))
      },
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('TTS Route Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to synthesize speech' },
      { status: 500 }
    )
  }
}