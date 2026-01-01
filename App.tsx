
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Play, Pause, FastForward, Trash2, Settings, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Loader2, Download, Filter, Layers, 
  LayoutGrid, Edit2, RotateCcw, FileJson, Key, Sliders, ExternalLink, Type, PlusCircle, Upload, Trash, Palette, DownloadCloud
} from 'lucide-react';
import { 
  DesignPrompt, 
  Category, 
  CategoryInfo,
  AppState, 
  LogoEffects,
  AspectRatio,
  ImageModel
} from './types';
import { 
  INITIAL_CATEGORIES,
  DEFAULT_LOGO_EFFECTS, 
  DEFAULT_SETTINGS, 
  generateInitialPrompts 
} from './constants';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import { imageProcessor } from './services/imageProcessor';

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
    const savedCategories = storageService.getCategories() || INITIAL_CATEGORIES;
    return {
      settings: savedSettings,
      categories: savedCategories,
      prompts: generateInitialPrompts(savedCategories),
      currentIndex: 0,
      isGenerating: false,
      activeLogo: savedLogos[0] || null,
      logoLibrary: savedLogos,
      logoEffects: DEFAULT_LOGO_EFFECTS,
    };
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompts' | 'gallery' | 'control'>('prompts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<DesignPrompt | null>(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPromptData, setNewPromptData] = useState<Partial<DesignPrompt>>({
    category: state.categories[0]?.id || '',
    name: '',
    prompt: '',
    logoPrompt: '',
    description: ''
  });
  const [bulkImportMode, setBulkImportMode] = useState<'append' | 'overwrite'>('append');
  const [categoryLogoUpdate, setCategoryLogoUpdate] = useState<{cat: Category, prompt: string}>({ cat: state.categories[0]?.id || '', prompt: '' });
  
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSection, setNewSection] = useState({ name: '', color: '#3b82f6' });
  const [editingSection, setEditingSection] = useState<CategoryInfo | null>(null);

  useEffect(() => {
    storageService.saveSettings(state.settings);
    storageService.saveLogoLibrary(state.logoLibrary);
    storageService.saveCategories(state.categories);
  }, [state.settings, state.logoLibrary, state.categories]);

  const filteredPrompts = useMemo(() => 
    state.prompts.filter(p => filter === 'all' || p.category === filter),
  [state.prompts, filter]);

  const stats = {
    total: state.prompts.length,
    completed: state.prompts.filter(p => p.status === 'completed').length,
    pending: state.prompts.filter(p => p.status === 'pending').length,
    failed: state.prompts.filter(p => p.status === 'failed').length,
  };

  const toggleSelectPrompt = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPrompts.length && filteredPrompts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPrompts.map(p => p.id)));
    }
  };

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

  const handleApiKeySelect = async () => {
    try {
      // @ts-ignore
      if (window.aistudio) await window.aistudio.openSelectKey();
      setShowSettings(false);
    } catch (e) {
      setErrorMsg("فشل في اختيار مفتاح API");
    }
  };

  const generateSingle = async (index: number) => {
    const currentApiKey = state.settings.apiKey || (process.env.API_KEY as string);
    const promptToProcess = state.prompts[index];
    if (!promptToProcess) return;

    if (!currentApiKey && state.settings.model === 'gemini-3-pro-image-preview') {
      // @ts-ignore
      const hasKey = window.aistudio ? await window.aistudio.hasSelectedApiKey() : false;
      if (!hasKey) {
        setErrorMsg("يجب اختيار مفتاح API لموديل Pro أولاً.");
        setShowSettings(true);
        return;
      }
    }
    
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'generating' } : p)
    }));

    try {
      const combinedPrompt = `${promptToProcess.prompt}. ${promptToProcess.logoPrompt || ''}`;
      const baseImage = await geminiService.generateMockup(
        combinedPrompt, currentApiKey, state.settings.imageQuality,
        state.settings.model, state.settings.aspectRatio, state.settings.seed
      );

      let finalImage = baseImage;
      if (state.activeLogo) {
        finalImage = await imageProcessor.applyLogo(baseImage, state.activeLogo, state.logoEffects);
      }

      await storageService.saveImage(promptToProcess.id, finalImage);

      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map((p, i) => i === index ? { 
          ...p, status: 'completed', resultImageUrl: finalImage 
        } : p)
      }));
    } catch (err: any) {
      if (err.message === "KEY_RESET_REQUIRED") {
        setErrorMsg("انتهت صلاحية مفتاح API أو المشروع غير صالح. يرجى إعادة الاختيار.");
        setShowSettings(true);
      }
      setState(prev => ({
        ...prev,
        isGenerating: state.settings.pauseOnError ? false : prev.isGenerating,
        prompts: prev.prompts.map((p, i) => i === index ? { ...p, status: 'failed', error: err.message } : p)
      }));
    }
  };

  const runAutomation = useCallback(async () => {
    if (!state.isGenerating) return;

    // Filter logic: exclusively process selected items if any exist, otherwise process all pending
    const promptsToSearch = state.prompts.filter(p => {
      const isPending = p.status === 'pending';
      const isTargeted = selectedIds.size === 0 || selectedIds.has(p.id);
      return isPending && isTargeted;
    });

    if (promptsToSearch.length === 0) {
      setState(prev => ({ ...prev, isGenerating: false }));
      return;
    }

    const nextPrompt = promptsToSearch[0];
    const nextIndex = state.prompts.indexOf(nextPrompt);

    setState(prev => ({ ...prev, currentIndex: nextIndex }));
    await generateSingle(nextIndex);

    if (state.isGenerating) {
      setTimeout(() => {
        runAutomation();
      }, state.settings.delayBetweenGenerations);
    }
  }, [state.isGenerating, state.prompts, state.settings, selectedIds, generateSingle]);

  useEffect(() => {
    if (state.isGenerating) runAutomation();
  }, [state.isGenerating, runAutomation]);

  const toggleAuto = () => setState(prev => ({ ...prev, isGenerating: !prev.isGenerating }));

  const downloadAll = async () => {
    const completed = state.prompts.filter(p => p.status === 'completed' && p.resultImageUrl);
    // Filter by selection if selection exists
    const targetPrompts = selectedIds.size > 0 
      ? completed.filter(p => selectedIds.has(p.id))
      : completed;

    if (targetPrompts.length === 0) {
      alert(selectedIds.size > 0 ? "لا توجد تصميمات مكتملة ضمن تحديدك" : "لا توجد تصميمات جاهزة للتنزيل");
      return;
    }

    if (!confirm(`سيتم تنزيل ${targetPrompts.length} صورة. هل تريد الاستمرار؟`)) return;

    let delay = 0;
    targetPrompts.forEach((p, idx) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = p.resultImageUrl!;
        link.download = `${p.id}_${p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, delay);
      delay += 600; // Slightly increased delay for better reliability
    });
  };

  const resetAll = (targetStatus: 'pending' | 'failed' | 'completed') => {
    if (confirm(`إعادة تعيين جميع التصاميم ذات الحالة: ${targetStatus}؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => p.status === targetStatus ? { ...p, status: 'pending', resultImageUrl: undefined, error: undefined } : p)
      }));
    }
  };

  const clearAllPrompts = () => {
    if (confirm("هل أنت متأكد من مسح جميع البرومبتات؟")) {
      setState(prev => ({ ...prev, prompts: [], currentIndex: 0, isGenerating: false }));
      setSelectedIds(new Set());
    }
  };

  const updatePrompt = (updated: DesignPrompt) => {
    setState(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => p.id === updated.id ? updated : p)
    }));
    setEditingPrompt(null);
  };

  const removePrompt = (id: string) => {
    if (confirm("حذف هذا التصميم؟")) {
      setState(prev => ({ ...prev, prompts: prev.prompts.filter(p => p.id !== id) }));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const addIndividualPrompt = () => {
    if (!newPromptData.prompt) return alert("البرومبت الرئيسي مطلوب");
    const prompt: DesignPrompt = {
      id: `custom-${Date.now()}`,
      category: newPromptData.category || (state.categories[0]?.id || 'pizza'),
      name: newPromptData.name || `تصميم جديد ${state.prompts.length + 1}`,
      prompt: newPromptData.prompt!,
      logoPrompt: newPromptData.logoPrompt || '',
      description: newPromptData.description || '',
      status: 'pending',
      metadata: { dimensions: '1024x1024', style: 'professional', estimatedTime: 45, priority: 'medium' }
    };
    setState(prev => ({ ...prev, prompts: [...prev.prompts, prompt] }));
    setShowAddModal(false);
    setNewPromptData({ category: state.categories[0]?.id || '', name: '', prompt: '', logoPrompt: '', description: '' });
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json)) throw new Error("JSON should be an array");
        const catIds = state.categories.map(c => c.id);
        const valid = json.filter(item => item.prompt).map(item => ({
          id: item.id || `${item.category || 'pizza'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          category: (catIds.includes(item.category) ? item.category : (catIds[0] || 'pizza')),
          name: item.name || `مستورد ${Date.now()}`,
          prompt: item.prompt,
          logoPrompt: item.logoPrompt || '',
          description: item.description || '',
          status: 'pending',
          metadata: item.metadata || { dimensions: '1024x1024', style: 'professional', estimatedTime: 45, priority: 'medium' }
        }));
        setState(prev => ({
          ...prev,
          prompts: bulkImportMode === 'overwrite' ? valid : [...prev.prompts, ...valid]
        }));
        alert(`تم استيراد ${valid.length} بنجاح`);
      } catch (err) { alert("خطأ في قراءة JSON"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyCategoryLogoPrompt = () => {
    if (!categoryLogoUpdate.prompt) return alert("الرجاء إدخال البرومبت");
    const catName = state.categories.find(c => c.id === categoryLogoUpdate.cat)?.name || categoryLogoUpdate.cat;
    if (confirm(`تحديث برومبت اللوغو لجميع تصاميم قسم ${catName}؟`)) {
      setState(prev => ({
        ...prev,
        prompts: prev.prompts.map(p => p.category === categoryLogoUpdate.cat ? { ...p, logoPrompt: categoryLogoUpdate.prompt } : p)
      }));
    }
  };

  const handleAddSection = () => {
    if (!newSection.name) return;
    const id = newSection.name.toLowerCase().replace(/\s+/g, '-');
    if (state.categories.some(c => c.id === id)) return alert("القسم موجود بالفعل");
    const category: CategoryInfo = { id, name: newSection.name, color: newSection.color };
    setState(prev => ({ ...prev, categories: [...prev.categories, category] }));
    setNewSection({ name: '', color: '#3b82f6' });
  };

  const handleDeleteSection = (id: string) => {
    if (state.categories.length <= 1) return alert("يجب وجود قسم واحد على الأقل");
    if (confirm("حذف القسم؟")) {
      const remaining = state.categories.filter(c => c.id !== id);
      const fallbackId = remaining[0].id;
      setState(prev => ({
        ...prev,
        categories: remaining,
        prompts: prev.prompts.map(p => p.category === id ? { ...p, category: fallbackId } : p)
      }));
    }
  };

  const handleModifySection = () => {
    if (!editingSection) return;
    setState(prev => ({
      ...prev,
      categories: prev.categories.map(c => c.id === editingSection.id ? editingSection : c)
    }));
    setEditingSection(null);
  };

  const exportPrompts = () => {
    const data = JSON.stringify(state.prompts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nsdev_data_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">NSDEV Mockups Generator</h1>
              <p className="text-xs text-slate-400">Integrated Branding Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex gap-4 text-xs font-bold uppercase tracking-wider">
              <span className="text-green-400">{stats.completed} Done</span>
              <span className="text-yellow-400">{stats.pending} Pending</span>
              <span className="text-red-400">{stats.failed} Error</span>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full">
              <Settings className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Play className="w-5 h-5 text-blue-500" /> لوحة التحكم</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={toggleAuto} className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${state.isGenerating ? 'bg-orange-500' : 'bg-green-600'}`}>
                {state.isGenerating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {state.isGenerating ? 'إيقاف مؤقت' : (selectedIds.size > 0 ? `بدء المختار (${selectedIds.size})` : 'بدء التلقائي')}
              </button>
              <button onClick={() => generateSingle(state.currentIndex)} disabled={state.isGenerating} className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50">
                <FastForward className="w-5 h-5" /> توليد فردي
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-bold"><span>التقدم</span><span className="text-blue-600">{Math.round((stats.completed / (stats.total || 1)) * 100)}%</span></div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${(stats.completed / (stats.total || 1)) * 100}%` }}></div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button onClick={downloadAll} className="col-span-2 py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-black">
                <DownloadCloud className="w-5 h-5" /> {selectedIds.size > 0 ? `تنزيل المختار (${selectedIds.size})` : 'تنزيل الكل المكتمل'}
              </button>
              <button onClick={() => resetAll('failed')} className="py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50"><RotateCcw className="w-3 h-3 inline mr-1" /> إعادة الفاشل</button>
              <button onClick={exportPrompts} className="py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50"><FileJson className="w-3 h-3 inline mr-1" /> تصدير</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-purple-500" /> إدارة الشعار</h2>
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-slate-200 group-hover:border-purple-300 rounded-xl p-6 text-center transition-all bg-slate-50">
                <Upload className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                <p className="text-sm font-bold text-slate-700">رفع شعار جديد (PNG)</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </label>
            {state.activeLogo && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <img src={state.activeLogo} className="w-12 h-12 object-contain bg-slate-200 rounded-lg" alt="Active logo" />
                  <div className="text-xs font-bold">الشعار النشط</div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-bold"><span>الحجم</span><span className="text-purple-600">{state.logoEffects.size}%</span></div>
                  <input type="range" min="5" max="40" value={state.logoEffects.size} onChange={(e) => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, size: parseInt(e.target.value) }}))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-purple-600 appearance-none" />
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200 rounded-lg">
                    {['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((pos: any) => (
                      <button key={pos} onClick={() => setState(prev => ({ ...prev, logoEffects: { ...prev.logoEffects, position: pos }}))} className={`h-6 rounded-md transition-all ${state.logoEffects.position === pos ? 'bg-purple-600' : 'hover:bg-slate-300'}`}></button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-slate-100/50 p-2 rounded-xl flex gap-2 overflow-x-auto no-scrollbar">
            <NavItem label="الكل" active={filter === 'all'} onClick={() => setFilter('all')} color="#64748b" count={state.prompts.length} />
            {state.categories.map((cat) => (
              <NavItem key={cat.id} label={cat.name} active={filter === cat.id} onClick={() => setFilter(cat.id)} color={cat.color} count={state.prompts.filter(p => p.category === cat.id).length} />
            ))}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              {['prompts', 'control', 'gallery'].map((tab: any) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-4 text-sm font-bold capitalize ${activeTab === tab ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}>
                  {tab === 'prompts' ? 'التصاميم' : tab === 'control' ? 'الإدارة' : 'المعرض'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'prompts' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
                        <input type="checkbox" checked={selectedIds.size === filteredPrompts.length && filteredPrompts.length > 0} onChange={toggleSelectAll} className="w-5 h-5 rounded accent-blue-600 cursor-pointer" />
                        تحديد الكل ({filteredPrompts.length})
                      </label>
                      {selectedIds.size > 0 && (
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">تم اختيار {selectedIds.size}</span>
                      )}
                    </div>
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:shadow-lg active:scale-95 transition-all"><PlusCircle className="w-4 h-4" /> إضافة تصميم</button>
                  </div>
                  <div className="space-y-3">
                    {filteredPrompts.map((p, idx) => {
                      const globalIdx = state.prompts.indexOf(p);
                      const cat = state.categories.find(c => c.id === p.category);
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <div key={p.id} className={`group p-4 rounded-2xl border transition-all flex items-center gap-4 ${state.currentIndex === globalIdx ? 'ring-2 ring-blue-500 bg-blue-50' : isSelected ? 'bg-slate-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectPrompt(p.id)} className="w-5 h-5 rounded accent-blue-600 cursor-pointer shrink-0" />
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: cat?.color || '#64748b' }}>{globalIdx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-800 text-sm truncate">{p.name}</h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : p.status === 'generating' ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate italic">{p.prompt}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => setEditingPrompt(p)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => removePrompt(p.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><Trash className="w-4 h-4" /></button>
                            <button onClick={() => generateSingle(globalIdx)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-green-600"><Play className="w-4 h-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'control' && (
                <div className="space-y-8">
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="flex justify-between items-center mb-4"><h4 className="font-bold text-slate-800 flex items-center gap-2"><Palette className="w-4 h-4 text-green-600" /> إدارة الأقسام</h4><button onClick={() => setShowSectionModal(true)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:shadow-md">إضافة قسم</button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {state.categories.map(cat => (
                        <div key={cat.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div><span className="text-sm font-bold text-slate-700">{cat.name}</span></div>
                          <div className="flex gap-1"><button onClick={() => setEditingSection(cat)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => handleDeleteSection(cat.id)} className="p-1.5 hover:bg-red-50 rounded text-slate-400"><Trash className="w-3.5 h-3.5" /></button></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <h4 className="font-bold mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-blue-600" /> استيراد JSON</h4>
                      <div className="flex items-center gap-4 mb-4 text-xs font-bold">
                        <label className="flex items-center gap-1"><input type="radio" checked={bulkImportMode === 'append'} onChange={() => setBulkImportMode('append')} /> إضافة</label>
                        <label className="flex items-center gap-1"><input type="radio" checked={bulkImportMode === 'overwrite'} onChange={() => setBulkImportMode('overwrite')} /> مسح واستبدال</label>
                      </div>
                      <label className="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-white cursor-pointer transition-all">
                        <FileJson className="w-8 h-8 mx-auto mb-2 text-slate-400" /><p className="text-xs font-bold">ارفع ملف JSON</p>
                        <input type="file" accept=".json" onChange={handleBulkImport} className="hidden" />
                      </label>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-3">
                      <h4 className="font-bold flex items-center gap-2 text-red-600"><Trash2 className="w-4 h-4" /> أوامر شاملة</h4>
                      <button onClick={clearAllPrompts} className="w-full py-3 bg-red-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-red-700">مسح جميع البرومبتات</button>
                      <button onClick={() => resetAll('pending')} className="w-full py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-white">إعادة تعيين الجميع</button>
                      <button onClick={downloadAll} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-black flex items-center justify-center gap-2"><DownloadCloud className="w-4 h-4" /> تنزيل النتائج المكتملة</button>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                    <h4 className="font-bold mb-2 flex items-center gap-2 text-purple-600"><Type className="w-4 h-4" /> تحديث موحد للوغو</h4>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <select value={categoryLogoUpdate.cat} onChange={(e) => setCategoryLogoUpdate({...categoryLogoUpdate, cat: e.target.value})} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none">
                        {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="text" value={categoryLogoUpdate.prompt} onChange={(e) => setCategoryLogoUpdate({...categoryLogoUpdate, prompt: e.target.value})} placeholder="برومبت اللوغو الجديد..." className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none" />
                      <button onClick={applyCategoryLogoPrompt} className="px-6 py-2 bg-purple-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-purple-700">تحديث</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-2xl">
                    <h3 className="font-bold text-slate-800">النتائج الجاهزة: {stats.completed}</h3>
                    <button onClick={downloadAll} className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black shadow-lg"><DownloadCloud className="w-5 h-5" /> تنزيل {selectedIds.size > 0 ? 'المختار' : 'الكل'}</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {state.prompts.filter(p => p.status === 'completed' && p.resultImageUrl).map(p => {
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <div key={p.id} className={`relative group aspect-square rounded-2xl overflow-hidden shadow-sm border ${isSelected ? 'ring-4 ring-blue-500 border-blue-500' : 'border-slate-100'} bg-slate-50`}>
                          <img src={p.resultImageUrl} className="w-full h-full object-cover" loading="lazy" alt={p.name} />
                          <div className="absolute top-2 right-2"><input type="checkbox" checked={isSelected} onChange={() => toggleSelectPrompt(p.id)} className="w-5 h-5 rounded cursor-pointer accent-blue-600" /></div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <p className="text-[10px] text-white font-bold truncate mb-2">{p.name}</p>
                            <a href={p.resultImageUrl} download={`${p.id}.png`} className="w-full bg-white text-slate-900 text-[10px] font-bold py-1.5 rounded-lg text-center hover:bg-blue-50">تنزيل</a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {stats.completed === 0 && <div className="text-center py-20 text-slate-300 font-bold"><LayoutGrid className="w-16 h-16 mx-auto mb-4 opacity-20" /> لا توجد صور مكتملة حالياً</div>}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Modals - Adding New Design */}
      {showAddModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><PlusCircle className="w-5 h-5 text-blue-400" /> إضافة تصميم جديد</h3><button onClick={() => setShowAddModal(false)} className="hover:bg-white/10 rounded-full p-1"><Trash2 className="w-5 h-5 rotate-45" /></button></div>
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1"><label className="text-xs font-bold text-slate-500 block mb-1">القسم</label><select value={newPromptData.category} onChange={(e) => setNewPromptData({...newPromptData, category: e.target.value})} className="w-full px-4 py-2 border rounded-xl font-bold text-sm bg-slate-50">{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="col-span-2 sm:col-span-1"><label className="text-xs font-bold text-slate-500 block mb-1">اسم التصميم</label><input type="text" value={newPromptData.name} onChange={(e) => setNewPromptData({...newPromptData, name: e.target.value})} placeholder="برجر كلاسيك..." className="w-full px-4 py-2 border rounded-xl text-sm bg-slate-50" /></div>
              </div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">البرومبت (Mockup)</label><textarea rows={3} value={newPromptData.prompt} onChange={(e) => setNewPromptData({...newPromptData, prompt: e.target.value})} className="w-full px-4 py-2 border rounded-xl text-sm font-mono bg-slate-50" /></div>
              <div><label className="text-xs font-bold text-slate-500 block mb-1">لوغو (Logo Prompt)</label><textarea rows={2} value={newPromptData.logoPrompt} onChange={(e) => setNewPromptData({...newPromptData, logoPrompt: e.target.value})} className="w-full px-4 py-2 border rounded-xl text-sm font-mono bg-slate-50" /></div>
              <button onClick={addIndividualPrompt} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all">إضافة للقائمة</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals - Editing Prompt */}
      {editingPrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-400" /> تعديل التصميم</h3><button onClick={() => setEditingPrompt(null)} className="hover:bg-white/10 rounded-full p-1"><RotateCcw className="w-5 h-5 rotate-45" /></button></div>
            <div className="p-6 space-y-4">
              <input type="text" value={editingPrompt.name} onChange={(e) => setEditingPrompt({...editingPrompt, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl text-sm font-bold bg-slate-50" />
              <textarea rows={3} value={editingPrompt.prompt} onChange={(e) => setEditingPrompt({...editingPrompt, prompt: e.target.value})} className="w-full px-4 py-2 border rounded-xl text-sm font-mono bg-slate-50" />
              <textarea rows={2} value={editingPrompt.logoPrompt} onChange={(e) => setEditingPrompt({...editingPrompt, logoPrompt: e.target.value})} placeholder="Logo prompt..." className="w-full px-4 py-2 border rounded-xl text-sm font-mono bg-slate-50" />
              <div className="flex gap-2"><button onClick={() => updatePrompt(editingPrompt!)} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">حفظ</button><button onClick={() => setEditingPrompt(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modals - Section Management */}
      {showSectionModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-600"><PlusCircle className="w-5 h-5" /> إضافة قسم</h3>
            <div className="space-y-4">
              <input type="text" value={newSection.name} onChange={(e) => setNewSection({...newSection, name: e.target.value})} placeholder="الاسم..." className="w-full px-4 py-2 border rounded-xl bg-slate-50 outline-none" />
              <input type="color" value={newSection.color} onChange={(e) => setNewSection({...newSection, color: e.target.value})} className="w-full h-10 border rounded-xl bg-slate-50" />
              <div className="flex gap-2"><button onClick={() => { handleAddSection(); setShowSectionModal(false); }} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl">إضافة</button><button onClick={() => setShowSectionModal(false)} className="flex-1 py-3 bg-slate-100 rounded-xl">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {editingSection && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-blue-600">تعديل القسم</h3>
            <div className="space-y-4">
              <input type="text" value={editingSection.name} onChange={(e) => setEditingSection({...editingSection, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-slate-50 outline-none" />
              <input type="color" value={editingSection.color} onChange={(e) => setEditingSection({...editingSection, color: e.target.value})} className="w-full h-10 border rounded-xl bg-slate-50" />
              <div className="flex gap-2"><button onClick={handleModifySection} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">حفظ</button><button onClick={() => setEditingSection(null)} className="flex-1 py-3 bg-slate-100 rounded-xl">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center"><h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-6 h-6 text-blue-400" /> الإعدادات</h2><button onClick={() => setShowSettings(false)} className="hover:bg-white/10 rounded-full p-1"><RotateCcw className="w-6 h-6 rotate-45" /></button></div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex flex-col gap-2"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMsg}</div>{errorMsg.includes("Pro") && <button onClick={handleApiKeySelect} className="bg-red-600 text-white py-1.5 px-3 rounded-lg w-fit">إعداد مفتاح Pro</button>}</div>}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1 uppercase"><Key className="w-3 h-3" /> نموذج الذكاء الاصطناعي</span>
                <div className="flex bg-slate-200 p-1 rounded-xl">
                   <button onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-2.5-flash-image' }}))} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${state.settings.model === 'gemini-2.5-flash-image' ? 'bg-white text-blue-600' : 'text-slate-500'}`}>Flash</button>
                   <button onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, model: 'gemini-3-pro-image-preview' }}))} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${state.settings.model === 'gemini-3-pro-image-preview' ? 'bg-white text-purple-600' : 'text-slate-500'}`}>Pro</button>
                </div>
                {state.settings.model === 'gemini-3-pro-image-preview' ? <button onClick={handleApiKeySelect} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-md">اختيار مفتاح Pro</button> : <input type="password" value={state.settings.apiKey} onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, apiKey: e.target.value } }))} className="w-full px-4 py-2 bg-white border rounded-xl outline-none text-xs" placeholder="Flash API Key (اختياري)" />}
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[10px] text-blue-500 flex items-center justify-center gap-1">تعلم المزيد عن المفاتيح <ExternalLink className="w-2 h-2" /></a>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                 <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1"><Sliders className="w-3 h-3" /> المعايير التقنية</span>
                 <div className="grid grid-cols-2 gap-4">
                   <select value={state.settings.aspectRatio} onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, aspectRatio: e.target.value as any } }))} className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold outline-none"><option value="1:1">1:1</option><option value="3:4">3:4</option><option value="4:3">4:3</option><option value="9:16">9:16</option><option value="16:9">16:9</option></select>
                   <select value={state.settings.imageQuality} disabled={state.settings.model !== 'gemini-3-pro-image-preview'} onChange={(e) => setState(prev => ({ ...prev, settings: { ...prev.settings, imageQuality: e.target.value as any } }))} className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold outline-none disabled:opacity-50"><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select>
                 </div>
              </div>
              <button onClick={() => { setShowSettings(false); setErrorMsg(null); }} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all">تطبيق</button>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-slate-200 p-3 text-xs flex justify-between items-center text-slate-500">
        <div className="flex gap-4">
          <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${state.settings.model === 'gemini-3-pro-image-preview' ? 'bg-purple-500' : 'bg-blue-500'}`}></div> Model: {state.settings.model.split('-')[2].toUpperCase()}</div>
          <div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${state.isGenerating ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div> Automation: {state.isGenerating ? 'Active' : 'Idle'}</div>
        </div>
        <div className="font-bold">NSDEV Mockups Tool • Branding Mastery</div>
      </footer>
    </div>
  );
};

export default App;
