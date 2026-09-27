import os
import re
import time
from dotenv import load_dotenv
from groq import Groq
import jiwer
from tabulate import tabulate

load_dotenv()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

TEST_SAMPLES = [
    (os.path.join(ROOT_DIR, "test_en.mp3"), "what is the status of my document parsing request", 3.2),
    (os.path.join(ROOT_DIR, "test_hi.mp3"), "नमस्ते आप मेरी क्या मदद कर सकते हैं", 3.4),
    (os.path.join(ROOT_DIR, "test_hinglish.mp3"), "mera account login nahi ho raha please help", 3.0),
]


def clean_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s\u0900-\u097F]", "", text)
    return " ".join(text.split())


def calculate_score(wer_val: float, rtf_val: float, mem_gb: float) -> float:
    wer_norm = min(max(wer_val, 0.0), 1.0)
    score = (
        0.40 * (1.0 - wer_norm)
        + 0.35 * (1.0 / (1.0 + rtf_val))
        + 0.25 * (1.0 / (1.0 + mem_gb))
    )
    return round(score * 100, 2)


def evaluate_model(client: Groq, model_name: str, local_mem_gb: float = 0.0):
    total_audio_sec = 0.0
    total_latency_sec = 0.0
    predictions = []
    references = []

    for file_path, truth, duration in TEST_SAMPLES:
        if not os.path.exists(file_path):
            print(f"Warning: Audio file '{file_path}' not found. Run 'python scripts/generate_benchmark_data.py' first.")
            continue

        total_audio_sec += duration
        start = time.perf_counter()

        with open(file_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(file_path), f.read()), model=model_name
            )

        total_latency_sec += time.perf_counter() - start
        predictions.append(clean_text(transcription.text))
        references.append(clean_text(truth))

    if not references:
        raise RuntimeError(
            "No valid audio sample files found to run benchmark. "
            "Please run 'python scripts/generate_benchmark_data.py' first."
        )

    wer_val = jiwer.wer(references, predictions)
    cer_val = jiwer.cer(references, predictions)
    rtf_val = total_latency_sec / total_audio_sec if total_audio_sec > 0 else 0.0

    return {
        "Model": model_name,
        "Local Footprint": f"{local_mem_gb} GB",
        "Avg Latency": f"{round(total_latency_sec / len(references), 2)}s",
        "RTF": round(rtf_val, 3),
        "WER": f"{round(wer_val * 100, 1)}%",
        "CER": f"{round(cer_val * 100, 1)}%",
        "Score (0-100)": calculate_score(wer_val, rtf_val, local_mem_gb),
    }


if __name__ == "__main__":
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not api_key.strip():
        raise ValueError("Error: Please set GROQ_API_KEY in your .env file")

    groq_client = Groq(api_key=api_key)
    models = ["whisper-large-v3-turbo", "whisper-large-v3"]
    table = [evaluate_model(groq_client, m, 0.0) for m in models]

    print("\n" + tabulate(table, headers="keys", tablefmt="github"))