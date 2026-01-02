
import { GoogleGenAI } from "@google/genai";
import { ImageModel, AspectRatio } from "../types";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const geminiService = {
  async generateMockup(
    prompt: string, 
    apiKey: string, 
    quality: '1K' | '2K' | '4K',
    model: ImageModel,
    aspectRatio: AspectRatio,
    seed: number | null,
    retryCount = 0
  ): Promise<string> {
    // Create new instance to ensure latest key is used as per guidelines
    const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
    const MAX_RETRIES = 3;
    
    try {
      const config: any = {
        imageConfig: {
          aspectRatio: aspectRatio,
        }
      };

      // imageSize is only for gemini-3-pro-image-preview
      if (model === 'gemini-3-pro-image-preview') {
        config.imageConfig.imageSize = quality;
      }

      if (seed !== null) {
        config.seed = seed;
      }

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [{ text: prompt }],
        },
        config: config,
      });

      // Find image part
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error('No image returned from Gemini');
    } catch (error: any) {
      console.error('Gemini Generation Error:', error);
      
      const errorMessage = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      
      // Handle the specific error case requested for key selection
      if (errorMessage.includes("Requested entity was not found")) {
        throw new Error("KEY_RESET_REQUIRED");
      }

      // Detect Quota errors (429 / RESOURCE_EXHAUSTED)
      const isQuotaError = 
        errorMessage.includes("429") || 
        errorMessage.includes("RESOURCE_EXHAUSTED") || 
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("rate limit") ||
        (error.status === 429);

      if (isQuotaError && retryCount < MAX_RETRIES) {
        // Exponential backoff: 3s, 7s, 15s... + random jitter
        const delay = Math.pow(2, retryCount + 1) * 3000 + Math.random() * 2000;
        console.warn(`Quota exceeded (429). Retrying in ${Math.round(delay)}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await wait(delay);
        return this.generateMockup(prompt, apiKey, quality, model, aspectRatio, seed, retryCount + 1);
      }

      // If it's a quota error but we've exhausted retries, throw a specific identifier
      if (isQuotaError) {
        throw new Error("QUOTA_EXHAUSTED");
      }
      
      throw error;
    }
  }
};
