
export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

export type Category = string;

export interface PromptMetadata {
  dimensions: string;
  style: string;
  estimatedTime: number;
  priority: 'low' | 'medium' | 'high';
}

export interface DesignPrompt {
  id: string;
  category: Category;
  name: string;
  prompt: string;
  logoPrompt?: string;
  description: string;
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';
  resultImageUrl?: string;
  error?: string;
  metadata: PromptMetadata;
  selected: boolean;
}

// مكونات البرومبت الذكية
export interface TemplateComponent {
  id: string;
  label: string;
  snippet: string;
}

export interface PromptTemplate {
  subjects: TemplateComponent[];
  environments: TemplateComponent[];
  lightings: TemplateComponent[];
  styles: TemplateComponent[];
}

export interface LogoEffects {
  size: number;
  opacity: number;
  rotation: number;
  position: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
    offset: { x: number; y: number };
  };
  border: {
    enabled: boolean;
    color: string;
    width: number;
    radius: number;
  };
  glow: {
    enabled: boolean;
    color: string;
    strength: number;
  };
}

export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export interface AppSettings {
  apiKey: string;
  model: ImageModel;
  aspectRatio: AspectRatio;
  seed: number | null;
  autoSave: boolean;
  autoGenerate: boolean;
  delayBetweenGenerations: number;
  imageQuality: '1K' | '2K' | '4K';
  theme: 'light' | 'dark';
  pauseOnError: boolean;
}

export interface AppState {
  settings: AppSettings;
  categories: CategoryInfo[];
  prompts: DesignPrompt[];
  template: PromptTemplate; // النظام الجديد للقوالب
  currentIndex: number;
  isGenerating: boolean;
  activeLogo: string | null;
  logoLibrary: string[];
  logoEffects: LogoEffects;
}
