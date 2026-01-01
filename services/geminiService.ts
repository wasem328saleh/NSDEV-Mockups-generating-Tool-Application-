
import { GoogleGenAI } from "@google/genai";
import { ImageModel, AspectRatio } from "../types";

export const geminiService = {
  async generateMockup(
    prompt: string, 
    apiKey: string, 
    quality: '1K' | '2K' | '4K',
    model: ImageModel,
    aspectRatio: AspectRatio,
    seed: number | null
  ): Promise<string> {
    // Create new instance to ensure latest key is used as per guidelines
    const ai = new GoogleGenAI({ apiKey });
    
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
      // Handle the specific error case requested for key selection
      if (error.message?.includes("Requested entity was not found")) {
        throw new Error("KEY_RESET_REQUIRED");
      }
      throw error;
    }
  }
};
