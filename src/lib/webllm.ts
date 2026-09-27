import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

// Ultra-lightweight model (~250MB-350MB, cached in browser IndexedDB)
export const IN_BROWSER_MODEL = "SmolLM2-360M-Instruct-q4f16_1-MLC";

let engineInstance: MLCEngine | null = null;

export async function getWebLLMEngine(
  onProgress?: (report: { text: string; progress: number }) => void
): Promise<MLCEngine> {
  if (engineInstance) return engineInstance;

  if (typeof window === "undefined" || !("gpu" in navigator)) {
    throw new Error(
      "WebGPU is not supported in this browser. Please use Chrome/Edge or toggle to Deep Analysis mode."
    );
  }

  engineInstance = await CreateMLCEngine(IN_BROWSER_MODEL, {
    initProgressCallback: onProgress,
  });

  return engineInstance;
}
