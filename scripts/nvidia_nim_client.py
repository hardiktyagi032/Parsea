import os
from dotenv import load_dotenv

# Load environment variables securely from .env file
load_dotenv()

def get_nvidia_client(model: str = "nvidia/nemotron-3-ultra-550b"):
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key or not api_key.strip():
        raise ValueError("Error: Please set NVIDIA_API_KEY in your .env file")
    
    base_url = "https://integrate.api.nvidia.com/v1"
    selected_model = os.getenv("NVIDIA_MODEL", model)
    
    try:
        from openai import OpenAI
        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        return {"client": client, "base_url": base_url, "model": selected_model, "api_key": api_key}
    except ImportError:
        return {"client": None, "base_url": base_url, "model": selected_model, "api_key": api_key}

if __name__ == "__main__":
    try:
        config = get_nvidia_client()
        print(f"NVIDIA NIM client configured for model: {config['model']} at endpoint: {config['base_url']}")
    except ValueError as err:
        print(err)
