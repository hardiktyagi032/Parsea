import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("NVIDIA_API_KEY")
if not api_key or not api_key.strip():
    raise ValueError("Error: Please set NVIDIA_API_KEY in your .env file")

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = api_key
)

model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")

completion = client.chat.completions.create(
  model=model,
  messages=[{"role":"user","content":"Write a limerick about the wonders of GPU computing."}],
  temperature=1,
  top_p=0.95,
  max_tokens=16384,
  extra_body={"chat_template_kwargs":{"enable_thinking":True}},
  stream=True
)

for chunk in completion:
  if not chunk.choices:
    continue
  reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
  if reasoning:
    print(reasoning, end="", flush=True)
  if chunk.choices[0].delta.content is not None:
    print(chunk.choices[0].delta.content, end="", flush=True)
print()
