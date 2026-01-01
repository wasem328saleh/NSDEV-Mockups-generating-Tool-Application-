
import { GoogleGenAI } from "@google/genai";

export const geminiService = {
  async generateMockup(prompt: string, apiKey: string, quality: '1K' | '2K' | '4K'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: quality
          }
        },
      });

      // Find image part
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error('No image returned from Gemini');
    } catch (error) {
      console.error('Gemini Generation Error:', error);
      throw error;
    }
  }
};
