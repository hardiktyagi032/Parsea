import asyncio
import os
import edge_tts

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

SAMPLES = [
    (
        os.path.join(ROOT_DIR, "test_en.mp3"),
        "what is the status of my document parsing request",
        "en-IN-NeerjaNeural",
    ),
    (
        os.path.join(ROOT_DIR, "test_hi.mp3"),
        "नमस्ते आप मेरी क्या मदद कर सकते हैं",
        "hi-IN-SwaraNeural",
    ),
    (
        os.path.join(ROOT_DIR, "test_hinglish.mp3"),
        "mera account login nahi ho raha please help",
        "en-IN-NeerjaNeural",
    ),
]


async def generate():
    for file_path, text, voice in SAMPLES:
        comm = edge_tts.Communicate(text, voice)
        await comm.save(file_path)
        print(f"Generated {os.path.basename(file_path)} at {file_path}")


if __name__ == "__main__":
    asyncio.run(generate())