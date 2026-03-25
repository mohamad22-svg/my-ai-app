/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  Wand2, 
  Eraser, 
  Download, 
  RefreshCw, 
  ShieldCheck, 
  Info,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini AI with the environment key
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusText, setStatusText] = useState("جاري تحليل الصورة وتطبيق الذكاء الاصطناعي...");
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPos = useRef<{ x: number, y: number } | null>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);

  // Initialize mask canvas
  useEffect(() => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImgRef.current || !maskCanvasRef.current) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImgRef.current, 0, 0, canvas.width, canvas.height);
    
    // Draw mask overlay
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff0000';
    ctx.drawImage(maskCanvasRef.current, 0, 0);
    ctx.restore();
  }, []);

  const processFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        originalImgRef.current = img;
        setImage(ev.target?.result as string);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle canvas setup and initial render when image state changes
  useEffect(() => {
    if (image && originalImgRef.current && canvasRef.current && maskCanvasRef.current) {
      const img = originalImgRef.current;
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;

      const scale = Math.min(1200 / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;

      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
      }

      render();
    }
  }, [image, render]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getCoords(e);
    lastPos.current = pos;
    draw(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !maskCanvasRef.current) return;
    const pos = getCoords(e);
    const maskCtx = maskCanvasRef.current.getContext('2d');
    if (!maskCtx || !lastPos.current) return;

    maskCtx.beginPath();
    maskCtx.moveTo(lastPos.current.x, lastPos.current.y);
    maskCtx.lineTo(pos.x, pos.y);
    maskCtx.strokeStyle = 'red';
    maskCtx.lineWidth = brushSize;
    maskCtx.stroke();
    
    lastPos.current = pos;
    render();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearMask = () => {
    if (!maskCanvasRef.current) return;
    const maskCtx = maskCanvasRef.current.getContext('2d');
    if (!maskCtx) return;
    maskCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    render();
  };

  const processImage = async () => {
    if (!originalImgRef.current || !maskCanvasRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    setStatusText("جاري تحليل العلامة المائية وإزالتها...");

    try {
      // Initialize AI inside the function to ensure fresh context
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

      // 1. Prepare original image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) throw new Error("Could not get context");
      tCtx.drawImage(originalImgRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const originalBase64 = tempCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];

      // 2. Prepare high-contrast mask
      const maskDataCanvas = document.createElement('canvas');
      maskDataCanvas.width = canvasRef.current.width;
      maskDataCanvas.height = canvasRef.current.height;
      const mdCtx = maskDataCanvas.getContext('2d');
      if (!mdCtx) throw new Error("Could not get context");
      
      mdCtx.fillStyle = 'black';
      mdCtx.fillRect(0, 0, maskDataCanvas.width, maskDataCanvas.height);
      mdCtx.drawImage(maskCanvasRef.current, 0, 0);
      
      const imgData = mdCtx.getImageData(0, 0, maskDataCanvas.width, maskDataCanvas.height);
      let hasMask = false;
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i] > 20) { // Any red content
          imgData.data[i] = 255; imgData.data[i+1] = 255; imgData.data[i+2] = 255;
          hasMask = true;
        } else {
          imgData.data[i] = 0; imgData.data[i+1] = 0; imgData.data[i+2] = 0;
        }
        imgData.data[i+3] = 255;
      }

      if (!hasMask) {
        alert("يرجى تلوين العلامة المائية أولاً بالفرشاة قبل البدء.");
        setIsProcessing(false);
        return;
      }

      mdCtx.putImageData(imgData, 0, 0);
      const maskBase64 = maskDataCanvas.toDataURL('image/png').split(',')[1];

      const prompt = `STRICT INPAINTING TASK:
      1. Use IMAGE 1 as the source.
      2. Use IMAGE 2 as the mask.
      3. ONLY modify the area marked as WHITE in the mask.
      4. DO NOT change, blur, or modify any pixels in the BLACK area of the mask. This is critical.
      5. Fill the WHITE area realistically to remove the object/text.
      6. Do not perform any other image enhancements or edits outside the white area.
      7. Return ONLY the final image.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: originalBase64 } },
            { inlineData: { mimeType: "image/png", data: maskBase64 } }
          ]
        }
      });

      const resultPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (resultPart?.inlineData?.data) {
        setResultImage(`data:image/png;base64,${resultPart.inlineData.data}`);
      } else {
        const textResponse = response.text;
        console.log("AI Response:", textResponse);
        throw new Error("الذكاء الاصطناعي لم يقم بتوليد صورة. يرجى محاولة تحديد المنطقة بشكل أوضح.");
      }
    } catch (error: any) {
      console.error("Processing error:", error);
      alert(error.message || "حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.download = `pixelperfect-result-${Date.now()}.png`;
    link.href = resultImage;
    link.click();
  };

  const reset = () => {
    setImage(null);
    setResultImage(null);
    originalImgRef.current = null;
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 font-['Tajawal',sans-serif] selection:bg-blue-500/30" dir="rtl">
      {/* Loading Overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 z-[100] flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-blue-500 animate-pulse" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-4">{statusText}</h2>
            <p className="text-slate-400 max-w-md">
              نحن نستخدم تقنية القناع المزدوج لضمان أفضل نتيجة ممكنة وحماية تفاصيلك الأصلية.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/50 backdrop-blur-xl border-b border-slate-800/50 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
                PixelPerfect <span className="text-blue-500">AI</span>
              </h1>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">
                Double-Mask AI Engine
              </p>
            </div>
          </div>
          {image && (
            <button 
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة البدء</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 lg:p-12">
        {!image ? (
          /* Upload Section */
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative group"
          >
            <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[3rem] blur transition duration-1000 ${isDragging ? 'opacity-100' : 'opacity-25 group-hover:opacity-50'}`} />
            <div 
              onClick={() => document.getElementById('file-upload')?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative bg-slate-900 border-2 border-dashed p-12 lg:p-24 rounded-[3rem] text-center cursor-pointer transition-all ${isDragging ? 'border-blue-500 bg-slate-800/80 scale-[1.01]' : 'border-slate-800 hover:bg-slate-800/50'}`}
            >
              <input 
                type="file" 
                id="file-upload" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageUpload}
              />
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 transition-all duration-500 ${isDragging ? 'bg-blue-500 scale-110 shadow-lg shadow-blue-500/50' : 'bg-slate-800 group-hover:scale-110'}`}>
                <Upload className={`w-10 h-10 ${isDragging ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <h2 className="text-3xl lg:text-4xl font-black mb-4">
                {isDragging ? 'أفلت الصورة الآن!' : 'ارفع الصورة للتحليل الدقيق'}
              </h2>
              <p className="text-slate-500 text-lg max-w-xl mx-auto">
                {isDragging ? 'سيتم البدء في تحليل الصورة فور إفلاتها' : 'تقنية القناع المزدوج تحمي أيقوناتك وتفاصيلك الأصلية. ما عليك سوى سحب الصورة هنا أو النقر للاختيار.'}
              </p>
            </div>
          </motion.div>
        ) : !resultImage ? (
          /* Editor Section */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-sm font-bold text-slate-400">حجم الفرشاة</label>
                    <span className="text-xs font-mono text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">
                      {brushSize}px
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="5" 
                    max="100" 
                    value={brushSize} 
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between mt-2 text-[10px] text-slate-600 font-mono">
                    <span>5px</span>
                    <span>100px</span>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-3">
                  <Info className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-[11px] text-blue-300/80 leading-relaxed">
                    نصيحة: لون العلامة المائية فقط. النظام سيقوم تلقائياً بحماية كل ما هو غير ملون باللون الأحمر.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={processImage}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white py-6 rounded-3xl font-black text-xl shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                  <div className="relative flex items-center justify-center gap-3">
                    <span>بدء المعالجة الذكية</span>
                    <Sparkles className="w-6 h-6" />
                  </div>
                </button>
                
                <button 
                  onClick={clearMask}
                  className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  <Eraser className="w-4 h-4" />
                  <span>إلغاء التحديد</span>
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="lg:col-span-3"
            >
              <div className="relative bg-slate-900 border border-slate-800 rounded-[3rem] p-4 lg:p-8 shadow-2xl overflow-hidden flex items-center justify-center min-h-[500px]">
                <canvas 
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="max-w-full h-auto rounded-2xl cursor-crosshair shadow-2xl"
                />
              </div>
            </motion.div>
          </div>
        ) : (
          /* Result Section */
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl mx-auto space-y-12 text-center"
          >
            <div className="relative group">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[3.5rem] blur-2xl opacity-20" />
              <div className="relative bg-slate-900 p-2 rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden">
                <img 
                  src={resultImage} 
                  alt="Result" 
                  className="w-full h-auto rounded-[2.8rem]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button 
                onClick={downloadResult}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-500 text-white px-10 py-5 rounded-2xl font-black text-lg shadow-xl shadow-green-500/20 transition-all hover:scale-105 active:scale-95"
              >
                <Download className="w-6 h-6" />
                <span>تحميل الصورة النظيفة</span>
              </button>
              
              <button 
                onClick={reset}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-10 py-5 rounded-2xl font-black text-lg transition-all hover:scale-105 active:scale-95"
              >
                <RefreshCw className="w-6 h-6" />
                <span>جرب صورة أخرى</span>
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-12 border-t border-slate-800/50 text-center">
        <p className="text-slate-500 text-sm">
          PixelPerfect AI © 2026 - مدعوم بتقنيات Gemini 2.5 Flash المتقدمة
        </p>
      </footer>
    </div>
  );
}
