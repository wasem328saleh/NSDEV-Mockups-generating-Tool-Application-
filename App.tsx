
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, FastForward, Trash2, Settings, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, Download, Filter, Layers, LayoutGrid } from 'lucide-react';
import { 
  DesignPrompt, 
  Category, 
  AppState, 
  LogoEffects 
} from './types';
import { 
  CATEGORY_COLORS, 
  CATEGORY_NAMES, 
  DEFAULT_LOGO_EFFECTS, 
  DEFAULT_SETTINGS, 
  generateInitialPrompts 
} from './constants';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import { imageProcessor } from './services/imageProcessor';

// Component defined outside to prevent re-renders
const NavItem: React.FC<{ 
  label: string; 
  active: boolean; 
  onClick: () => void; 
  color: string;
  count: number;
}> = ({ label, active, onClick, color, count }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
      active ? 'bg-white shadow-md text-slate-900 border-b-2' : 'text-slate-600 hover:bg-slate-100'
    }`}
    style={active ? { borderColor: color } : {}}
  >
    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
    <span className="font-bold">{label}</span>
    <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full">{count}</span>
  </button>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedSettings = storageService.getSettings() || DEFAULT_SETTINGS;
    const savedLogos = storageService.getLogoLibrary();
    return {
      settings: savedSettings,
      prompts: generateInitialPrompts(),
      currentIndex: 0,
      isGenerating: false,
      activeLogo: savedLogos[0] || null,
      logoLibrary: savedLogos,
      logoEffects: DEFAULT_LOGO_EFFECTS,
    };
  });

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompts' | 'gallery' | 'logo'>('prompts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state to storage
  useEffect(() => {
    storageService.saveSettings(state.settings);
    storageService.saveLogoLibrary(state.logoLibrary);
  }, [state.settings, state.logoLibrary]);

  const filteredPrompts = state.prompts.filter(p => filter === 'all' || p.category === filter);
  
  const stats = {
    total: state.prompts.length,
    completed: state.prompts.filter(p => p.status === 'completed').length,
    pending: state.prompts.filter(p => p.status === 'pending').length,
    failed: state.prompts.filter(p => p.status === 'failed').length,
  };

  const currentPrompt = state.prompts[state.currentIndex];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setState(prev => ({
          ...prev,
          activeLogo: base64,
          logoLibrary: [base64, ...prev.logoLibrary].slice(0, 50)
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSingle = async (index: number) => {
    if (!state.settings.apiKey) {
      setErrorMsg("الرجاء إدخال مفتاح API في الإعدادات أولاً.");
      setShowSettings(true);
      return;
    }

    const promptToProcess = state.prompts[index];
    
    // Set status to generating
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'generating' } : p)
    }));

    try {
      const baseImage = await geminiService.generateMockup(
        promptToProcess.prompt, 
        state.settings.apiKey, 
        state.settings.imageQuality
      );

      let finalImage = baseImage;
      if (state.activeLogo) {
        finalImage = await imageProcessor.applyLogo(baseImage, state.activeLogo, state.logoEffects);
      }

      await storageService.saveImage(promptToProcess.id, finalImage);

      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => i === index ? { 
          ...p, 
          status: 'completed', 
          resultImageUrl: finalImage 
        } : p)
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => i === index ? { 
          ...p, 
          status: 'failed', 
          error: err.message 
        } : p)
      }));
    }
  };

  const runAutomation = useCallback(async () => {
    if (!state.isGenerating) return;

    const nextIndex = state.prompts.findIndex((p, i) => i >= state.currentIndex && p.status === 'pending');
    
    if (nextIndex === -1) {
      setState(prev => ({ ...prev, isGenerating: false }));
      return;
    }

    setState(prev => ({ ...prev, currentIndex: nextIndex }));
    await generateSingle(nextIndex);

    // Delay before next one
    if (state.isGenerating) {
      setTimeout(() => {
        runAutomation();
      }, state.settings.delayBetweenGenerations);
    }
  }, [state.isGenerating, state.currentIndex, state.prompts, state.settings.apiKey]);

  useEffect(() => {
    if (state.isGenerating) {
      runAutomation();
    }
  }, [state.isGenerating]);

  const toggleAuto = () => setState(prev => ({ ...prev, isGenerating: !prev.isGenerating }));

  const clearAll = async () => {
    if (confirm("هل أنت متأكد من مسح جميع الصور والبيانات؟")) {
      await storageService.clearAll();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="container mx-auto flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">NSDEV Mockups Generator</h1>
              <p className="text-xs text-slate-400">Integrated Design Automation Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex gap-4 text-sm font-medium">
              <div className="flex flex-col items-center">
                <span className="text-green-400">{stats.completed}</span>
                <span className="text-[10px] text-slate-400">مكتمل</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-yellow-400">{stats.pending}</span>
                <span className="text-[10px] text-slate-400">متبقي</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-red-400">{stats.failed}</span>
                <span className="text-[10px] text-slate-400">فاشل</span>
              </div>
            </div>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 container mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar / Controls */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Main Controls Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-500" />
              لوحة التحكم
            </h2>
            
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button 
                onClick={toggleAuto}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg active:scale-95 ${
                  state.isGenerating ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {state.isGenerating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {state.isGenerating ? 'إيقاف مؤقت' : 'بدء التلقائي'}
              </button>
              
              <button 
                onClick={() => generateSingle(state.currentIndex)}
                disabled={state.isGenerating}
                className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
              >
                <FastForward className="w-5 h-5" />
                توليد فردي
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">التقدم العام</span>
                <span className="text-blue-600 font-bold">{Math.round((stats.completed / stats.total) * 100)}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-500" 
                  style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                ></div>
              </div>
            </div>

            <button 
              onClick={clearAll}
              className="mt-6 w-full flex items-center justify-center gap-2 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm font-bold border border-transparent hover:border-red-200 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              مسح السجل بالكامل
            </button>
          </div>

          {/* Logo Management Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-500" />
              إدارة الهوية (Logo)
            </h2>
            
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-slate-200 group-hover:border-purple-300 rounded-xl p-6 text-center transition-all bg-slate-50 group-hover:bg-purple-50">
                <div className="bg-white w-12 h-12 rounded-full shadow-md flex items-center justify-center mx-auto mb-3 text-purple-600">
                  <Download className="w-6 h-6 rotate-180" />
                </div>
                <p className="text-sm font-bold text-slate-700">رفع شعار جديد</p>
                <p className="text-[10px] text-slate-400 mt-1">PNG, SVG supported (Transparent)</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>

            {state.activeLogo && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">تعديل التأثيرات</p>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>الحجم</span>
                      <span className="font-bold text-purple-600">{state.logoEffects.size}%</span>
                    </div>
                    <input 
                      type="range" min="5" max="40" value={state.logoEffects.size} 
                      onChange={(e) => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, size: parseInt(e.target.value) }}))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600" 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>الشفافية</span>
                      <span className="font-bold text-purple-600">{state.logoEffects.opacity}%</span>
                    </div>
                    <input 
                      type="range" min="20" max="100" value={state.logoEffects.opacity} 
                      onChange={(e) => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, opacity: parseInt(e.target.value) }}))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600" 
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200 rounded-lg">
                    {(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as any).map((pos: any) => (
                      <button 
                        key={pos}
                        onClick={() => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, position: pos }}))}
                        className={`h-6 rounded-md transition-all ${state.logoEffects.position === pos ? 'bg-purple-600' : 'hover:bg-slate-300'}`}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content Area */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Navigation / Filters */}
          <div className="bg-slate-100/50 p-2 rounded-xl flex gap-2 overflow-x-auto no-scrollbar">
            <NavItem 
              label="الكل" active={filter === 'all'} onClick={() => setFilter('all')} 
              color="#64748b" count={state.prompts.length} 
            />
            {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
              <NavItem 
                key={key} label={label} active={filter === key} 
                onClick={() => setFilter(key as Category)} 
                color={CATEGORY_COLORS[key as Category]} 
                count={state.prompts.filter(p => p.category === key).length}
              />
            ))}
          </div>

          {/* Active Work Area */}
          <div className="bg-white p-2 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('prompts')}
                className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'prompts' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
              >
                قائمة البرومبتات
              </button>
              <button 
                onClick={() => setActiveTab('gallery')}
                className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'gallery' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
              >
                معرض المخرجات
              </button>
            </div>

            <div className="p-4 min-h-[500px]">
              {activeTab === 'prompts' && (
                <div className="grid grid-cols-1 gap-4">
                  {filteredPrompts.slice(0, 50).map((p, idx) => (
                    <div 
                      key={p.id}
                      className={`group p-4 rounded-2xl border transition-all hover:shadow-md flex items-center gap-4 ${
                        state.currentIndex === idx ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                      >
                        <span className="font-bold text-xs">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-800 text-sm truncate">{p.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                             p.status === 'completed' ? 'bg-green-100 text-green-700' : 
                             p.status === 'failed' ? 'bg-red-100 text-red-700' : 
                             p.status === 'generating' ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate italic">{p.prompt}</p>
                      </div>
                      <div className="shrink-0">
                        {p.status === 'completed' ? (
                          <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : p.status === 'failed' ? (
                          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                        ) : p.status === 'generating' ? (
                          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        ) : (
                          <button 
                            onClick={() => generateSingle(state.prompts.indexOf(p))}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-500 transition-colors"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {state.prompts.filter(p => p.status === 'completed' && p.resultImageUrl).map(p => (
                    <div key={p.id} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                      <img src={p.resultImageUrl} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-[10px] text-white font-bold truncate mb-2">{p.name}</p>
                        <div className="flex gap-2">
                          <a 
                            href={p.resultImageUrl} 
                            download={`${p.id}.png`}
                            className="flex-1 bg-white text-slate-900 text-[10px] font-bold py-1.5 rounded-lg text-center hover:bg-blue-50"
                          >
                            تنزيل
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stats.completed === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <LayoutGrid className="w-10 h-10" />
                      </div>
                      <h3 className="text-slate-500 font-bold">لا توجد صور مولدة بعد</h3>
                      <p className="text-xs text-slate-400">ابدأ عملية التوليد لرؤية النتائج هنا</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-400" />
                إعدادات التطبيق
              </h2>
              <button onClick={() => setShowSettings(false)} className="hover:bg-white/10 p-1 rounded-full">
                <Trash2 className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {errorMsg && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Gemini API Key</label>
                <input 
                  type="password"
                  value={state.settings.apiKey}
                  onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, apiKey: e.target.value } }))}
                  className="w-full px-4 py-3 bg-slate-100 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none transition-all"
                  placeholder="Paste your API key here..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">جودة الصورة</label>
                  <select 
                    value={state.settings.imageQuality}
                    onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, imageQuality: e.target.value as any } }))}
                    className="w-full px-4 py-3 bg-slate-100 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none"
                  >
                    <option value="1K">1K (Standard)</option>
                    <option value="2K">2K (High)</option>
                    <option value="4K">4K (Ultra)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">التأخير (ms)</label>
                  <input 
                    type="number"
                    value={state.settings.delayBetweenGenerations}
                    onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, delayBetweenGenerations: parseInt(e.target.value) } }))}
                    className="w-full px-4 py-3 bg-slate-100 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none"
                  />
                </div>
              </div>

              <button 
                onClick={() => { setShowSettings(false); setErrorMsg(null); }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95"
              >
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="bg-white border-t border-slate-200 p-3 text-xs flex justify-between items-center text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${state.settings.apiKey ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>API {state.settings.apiKey ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${state.isGenerating ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span>System {state.isGenerating ? 'Generating...' : 'Idle'}</span>
          </div>
        </div>
        <div className="font-medium">
          NSDEV v1.0.4 • © 2024
        </div>
      </footer>
    </div>
  );
};

export default App;
