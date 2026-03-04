import React, { useState } from 'react';
import Papa from 'papaparse';
import { GoogleGenAI } from '@google/genai';
import { Download, Wand2, AlertCircle, RefreshCw, Palette, Shapes } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';

type CardData = {
  id: string;
  element: string;
  category: string;
  cost: string;
  name: string;
  text: string;
  imageUrl?: string;
};

function renderCardText(text: string) {
  const lines = text.replace(/\\n/g, '\n').split('\n');
  
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\[D12\]|\[\d+\]|\[R\d+\]|\[Z\d+\])/g);
    
    return (
      <React.Fragment key={lineIndex}>
        {parts.map((part, partIndex) => {
          if (part === '[D12]') {
            return (
              <span key={partIndex} className="inline-flex items-center justify-center mx-0.5 align-middle" style={{ width: '1.4em', height: '1.4em', transform: 'translateY(-2px)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                  <polygon points="12 2 21 8 21 16 12 22 3 16 3 8" />
                  <polygon points="12 7 16.5 10.5 14.5 16 9.5 16 7.5 10.5" />
                  <line x1="12" y1="2" x2="12" y2="7" />
                  <line x1="21" y1="8" x2="16.5" y2="10.5" />
                  <line x1="21" y1="16" x2="14.5" y2="16" />
                  <line x1="12" y1="22" x2="14.5" y2="16" />
                  <line x1="12" y1="22" x2="9.5" y2="16" />
                  <line x1="3" y1="16" x2="9.5" y2="16" />
                  <line x1="3" y1="8" x2="7.5" y2="10.5" />
                  <text x="12" y="13.5" fontSize="5" textAnchor="middle" stroke="none" fill="currentColor" fontWeight="bold" fontFamily="sans-serif">12</text>
                </svg>
              </span>
            );
          }
          
          const numMatch = part.match(/^\[(\d+)\]$/);
          if (numMatch) {
            return (
              <span key={partIndex} className="inline-flex items-center justify-center bg-stone-800 text-white rounded-full mx-0.5 align-middle font-sans font-bold" style={{ width: '1.4em', height: '1.4em', fontSize: '0.9em', transform: 'translateY(-1px)' }}>
                {numMatch[1]}
              </span>
            );
          }

          const rMatch = part.match(/^\[R(\d+)\]$/);
          if (rMatch) {
            return (
              <span key={partIndex} className="inline-flex items-center justify-center mx-0.5 align-middle text-stone-800" style={{ width: '1.5em', height: '1.5em', transform: 'translateY(-2px)' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                  <polygon points="12 2 22 9.5 18 22 6 22 2 9.5" />
                  <text x="12" y="16" fontSize="10" textAnchor="middle" fill="white" fontWeight="bold" fontFamily="sans-serif">{rMatch[1]}</text>
                </svg>
              </span>
            );
          }

          const zMatch = part.match(/^\[Z(\d+)\]$/);
          if (zMatch) {
            return (
              <span key={partIndex} className="inline-flex items-center justify-center bg-stone-800 text-white rounded-sm mx-0.5 align-middle font-sans font-bold" style={{ width: '1.4em', height: '1.4em', fontSize: '0.9em', transform: 'translateY(-1px)' }}>
                {zMatch[1]}
              </span>
            );
          }
          
          return <span key={partIndex}>{part}</span>;
        })}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// --- PRNG Setup for Deterministic Generation ---
function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
  return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const ELEMENT_CONFIG: Record<string, any> = {
  feuer: {
    primaryColor: '#dc2626',
    colors: ['#ef4444', '#f97316', '#ea580c', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
    bg: '#fee2e2',
    shapes: ['star', 'polygon', 'lines'],
    pointRange: [3, 5]
  },
  wasser: {
    primaryColor: '#0284c7',
    colors: ['#3b82f6', '#2563eb', '#1d4ed8', '#0284c7', '#0369a1', '#075985', '#0c4a6e'],
    bg: '#e0f2fe',
    shapes: ['circle', 'ring', 'polygon'],
    pointRange: [5, 8]
  },
  erde: {
    primaryColor: '#16a34a',
    colors: ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#854d0e', '#713f12'],
    bg: '#dcfce7',
    shapes: ['polygon', 'polygon', 'lines'],
    pointRange: [4, 4]
  },
  luft: {
    primaryColor: '#0284c7',
    colors: ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#64748b', '#475569', '#334155'],
    bg: '#f1f5f9',
    shapes: ['circle', 'ring', 'star', 'lines'],
    pointRange: [6, 12]
  }
};

const generateFractalLinesStr = (radius: number, depth: number, color: string, rand: () => number) => {
  const lines: string[] = [];
  
  const branches = 4 + Math.floor(rand() * 5);
  const angleOffset = (Math.PI / 8) + (rand() * Math.PI / 4);
  const lengthDecay = 0.6 + (rand() * 0.2);
  
  const drawBranch = (x: number, y: number, length: number, angle: number, currentDepth: number) => {
    if (currentDepth === 0) return;
    
    const x2 = x + length * Math.cos(angle);
    const y2 = y + length * Math.sin(angle);
    
    lines.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${currentDepth * 0.8}" stroke-linecap="round" opacity="${0.3 + (currentDepth * 0.1)}" />`);
    
    drawBranch(x2, y2, length * lengthDecay, angle - angleOffset, currentDepth - 1);
    drawBranch(x2, y2, length * lengthDecay, angle + angleOffset, currentDepth - 1);
  };

  for (let i = 0; i < branches; i++) {
    drawBranch(0, 0, radius * 0.4, (i * 2 * Math.PI) / branches, depth);
  }
  
  if (rand() > 0.3) {
    lines.push(`<circle cx="0" cy="0" r="${radius * 0.9}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${5 + rand() * 10} ${5 + rand() * 15}" opacity="0.2" />`);
  }

  return lines.join('');
};

const renderLayerStr = (layer: any, cx: number, cy: number) => {
  const { shapeType, color, radius, isFill, strokeWidth, rotation, points, filter } = layer;
  
  const fillStr = isFill ? `fill="${color}" fill-opacity="0.4"` : `fill="none"`;
  const strokeStr = `stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round"`;
  const filterStr = filter ? `filter="url(#${filter})"` : '';
  
  switch (shapeType) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" ${fillStr} ${strokeStr} ${filterStr} />`;
    case 'ring':
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" ${strokeStr} stroke-dasharray="${strokeWidth * 2} ${strokeWidth * 4}" ${filterStr} />`;
    case 'polygon': {
      const pts = [];
      for (let i = 0; i < points; i++) {
        const angle = rotation + (i * 2 * Math.PI / points);
        pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${fillStr} ${strokeStr} ${filterStr} />`;
    }
    case 'star': {
      const pts = [];
      const innerRadius = radius * 0.4;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? radius : innerRadius;
        const angle = rotation + (i * Math.PI / points);
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${fillStr} ${strokeStr} ${filterStr} />`;
    }
    case 'lines': {
      const lines = [];
      for (let i = 0; i < points; i++) {
        const angle = rotation + (i * 2 * Math.PI / points);
        const x2 = cx + radius * Math.cos(angle);
        const y2 = cy + radius * Math.sin(angle);
        lines.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" ${strokeStr} />`);
      }
      return `<g ${filterStr}>${lines.join('')}</g>`;
    }
    default:
      return '';
  }
};

function generateGeometricImage(type: string, name: string): string {
  const typeMap: Record<string, string> = {
    'fire': 'feuer',
    'water': 'wasser',
    'earth': 'erde',
    'air': 'luft'
  };
  const mappedType = typeMap[type.toLowerCase()] || 'feuer';
  
  const seedStr = `${mappedType}-${name.toLowerCase().trim()}`;
  const seed = cyrb128(seedStr)[0];
  const rand = mulberry32(seed);
  
  const config = ELEMENT_CONFIG[mappedType] || ELEMENT_CONFIG['feuer'];
  
  const layers = [];
  const numLayers = Math.floor(rand() * 4) + 3;
  const availableFilters = ['none', 'none', 'glow', 'glow-strong', 'blur-subtle'];
  
  if (rand() > 0.5) {
     layers.push({
       id: 'boundary',
       shapeType: 'ring',
       color: config.colors[Math.floor(rand() * config.colors.length)],
       radius: 95,
       isFill: false,
       strokeWidth: 1 + rand() * 2,
       rotation: 0,
       points: 0,
       filter: rand() > 0.5 ? 'glow' : undefined
     });
  }

  for (let i = 0; i < numLayers; i++) {
    const shapeType = config.shapes[Math.floor(rand() * config.shapes.length)];
    const color = config.colors[Math.floor(rand() * config.colors.length)];
    const radius = 20 + rand() * 65;
    const isFill = rand() > 0.6;
    const strokeWidth = 1 + rand() * 3;
    const rotation = rand() * Math.PI * 2;
    
    const minPts = config.pointRange[0];
    const maxPts = config.pointRange[1];
    const points = minPts + Math.floor(rand() * (maxPts - minPts + 1));
    
    const filterChoice = availableFilters[Math.floor(rand() * availableFilters.length)];
    const filter = filterChoice === 'none' ? undefined : filterChoice;
    
    layers.push({
      id: `layer-${i}`,
      shapeType,
      color,
      radius,
      isFill,
      strokeWidth,
      rotation,
      points,
      filter
    });
  }
  
  layers.push({
    id: 'core',
    shapeType: rand() > 0.5 ? 'circle' : 'polygon',
    color: config.colors[0],
    radius: 5 + rand() * 10,
    isFill: true,
    strokeWidth: 1,
    rotation: rand() * Math.PI,
    points: config.pointRange[0],
    filter: rand() > 0.3 ? 'glow-strong' : undefined
  });

  const fractalLines = generateFractalLinesStr(450, 6, config.primaryColor, rand);
  
  const layersStr = layers.map(layer => `<g>${renderLayerStr(layer, 100, 100)}</g>`).join('');

  const svg = `
    <svg width="2100" height="900" viewBox="0 0 2100 900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="15" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="30" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="blur-subtle" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="${config.bg}" />
      <g transform="translate(450, 450)">
        ${fractalLines}
      </g>
      <g transform="translate(1650, 450)">
        ${fractalLines}
      </g>
      <g transform="translate(1050, 450) scale(3.5)">
        <g transform="translate(-100, -100)">
          ${layersStr}
        </g>
      </g>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function PlayingCard({ 
  card, 
  onRegenerate, 
  isRegenerating,
  isPdf = false
}: { 
  card: CardData; 
  onRegenerate: () => void; 
  isRegenerating: boolean; 
  isPdf?: boolean;
}) {
  const isSpell = card.category?.toLowerCase().includes('zauber') || card.category?.toLowerCase().includes('spell');
  
  const ElementStyles: Record<string, string> = {
    Fire: isSpell ? 'bg-gradient-to-br from-red-500 to-orange-700' : 'bg-red-600',
    Water: isSpell ? 'bg-gradient-to-br from-blue-500 to-cyan-700' : 'bg-blue-600',
    Air: isSpell ? 'bg-gradient-to-br from-slate-300 to-slate-500' : 'bg-slate-400',
    Earth: isSpell ? 'bg-gradient-to-br from-emerald-500 to-green-700' : 'bg-emerald-600',
  };
  
  const bgStyle = ElementStyles[card.element] || (isSpell ? 'bg-gradient-to-br from-stone-500 to-stone-700' : 'bg-stone-500');

  const shadowLg = isPdf ? '' : 'shadow-lg';
  const shadowSm = isPdf ? '' : 'shadow-sm';
  const shadowInner = isPdf ? '' : 'shadow-inner';

  const ImageComponent = (
    <div className={`w-full aspect-[21/9] bg-stone-300 border-2 border-stone-900/50 rounded-sm overflow-hidden relative group shrink-0 ${shadowSm}`}>
      {card.imageUrl && !isRegenerating ? (
        <>
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <button 
            onClick={onRegenerate}
            className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Regenerate Image"
          >
            <RefreshCw className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold">Regenerate</span>
          </button>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-stone-600 bg-stone-200">
          <div className="w-5 h-5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin mb-1" />
          <span className="text-[8px] uppercase tracking-widest font-bold">Drawing</span>
        </div>
      )}
    </div>
  );

  const theme = !isSpell 
    ? {
        headerBg: `bg-white/95 text-stone-900 ${shadowSm}`,
        costBg: `bg-stone-800 text-white ${shadowInner}`,
        typeBg: `bg-white/90 text-stone-900 ${shadowSm}`,
        textBg: `bg-white/95 text-stone-900 border-stone-800/50 ${shadowInner}`,
      }
    : {
        headerBg: `bg-stone-800/95 text-white ${shadowSm}`,
        costBg: `bg-white text-stone-900 ${shadowInner}`,
        typeBg: `bg-stone-800/90 text-white ${shadowSm}`,
        textBg: `bg-stone-800/95 text-stone-100 border-black/40 ${shadowInner}`,
      };

  return (
    <div id={`card-${card.id}`} className={`w-[2.5in] h-[3.5in] rounded-xl border-[12px] border-white ${bgStyle} flex flex-col p-1.5 box-border relative ${shadowLg} overflow-hidden`}>
      {/* Header */}
      <div className={`flex justify-between items-center px-1.5 py-0.5 mb-1.5 rounded-sm border border-black/20 ${theme.headerBg}`}>
        <h2 className="font-bold text-[11px] uppercase tracking-tight truncate pr-2 font-sans">{card.name}</h2>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${theme.costBg}`}>
          {card.cost}
        </div>
      </div>

      {ImageComponent}

      {/* Type Bar */}
      <div className={`text-[9px] font-bold uppercase tracking-widest text-center py-0.5 my-1.5 rounded-sm border border-black/20 ${theme.typeBg}`}>
        {card.category || 'Unknown Type'}
      </div>

      {/* Text Box */}
      <div className={`flex-1 border-2 rounded-sm p-2 overflow-hidden ${theme.textBg}`}>
        <div className="text-[10px] leading-snug font-serif whitespace-pre-wrap">
          {renderCardText(card.text)}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [csvInput, setCsvInput] = useState("Element,Kartentyp,Cost,Name,Text\nFire,Zauberspruch,3,Fireball,Deal [3] damage to any target.\nWater,Zauberspruch,2,Healing Rain,Restore [2] health to all friendly units.\\nRoll a [D12] and add [R5].\nEarth,Elementarkarte,4,Stone Golem,Taunt. [4] Health.\\nGain [Z2] Armor.\nAir,Zauberspruch,1,Gust,Push an enemy unit back [1] space.");
  const [globalStyle, setGlobalStyle] = useState("High quality, digital art, fantasy style, no text in the image, centered composition.");
  const [useAI, setUseAI] = useState(true);
  const [cards, setCards] = useState<CardData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const generateImageForCard = async (card: CardData): Promise<string | undefined> => {
    if (!useAI) {
      return generateGeometricImage(card.element, card.name);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `An illustration for a card named '${card.name}'. The card element is ${card.element}. The card type is ${card.category}. The card description is: ${card.text}. ${globalStyle}`;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "21:9",
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          return `data:image/png;base64,${base64EncodeString}`;
        }
      }
    } catch (imgErr) {
      console.error(`Failed to generate image for ${card.name}:`, imgErr);
    }
    return undefined;
  };

  const handleRegenerateImage = async (cardId: string) => {
    setRegeneratingIds(prev => new Set(prev).add(cardId));
    
    const cardToUpdate = cards.find(c => c.id === cardId);
    if (cardToUpdate) {
      const newImageUrl = await generateImageForCard(cardToUpdate);
      if (newImageUrl) {
        setCards(currentCards => 
          currentCards.map(c => c.id === cardId ? { ...c, imageUrl: newImageUrl } : c)
        );
      }
    }
    
    setRegeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    
    try {
      const results = Papa.parse(csvInput, {
        header: true,
        skipEmptyLines: true,
      });

      if (results.errors.length > 0) {
        throw new Error("Failed to parse CSV: " + results.errors[0].message);
      }

      const parsedCards: CardData[] = results.data.map((row: any) => ({
        id: Math.random().toString(36).substring(2, 9),
        element: row['Element'] || row['Card type'] || 'Unknown',
        category: row['Kartentyp'] || row['Category'] || row['Type'] || 'Card',
        cost: row['Cost'] || '0',
        name: row['Name'] || 'Unnamed',
        text: row['Text'] || '',
      }));

      setCards(parsedCards);

      const updatedCards = [...parsedCards];
      for (let i = 0; i < updatedCards.length; i++) {
        const card = updatedCards[i];
        setRegeneratingIds(prev => new Set(prev).add(card.id));
        
        const imageUrl = await generateImageForCard(card);
        if (imageUrl) {
          updatedCards[i] = { ...card, imageUrl };
          setCards([...updatedCards]);
        }
        
        setRegeneratingIds(prev => {
          const next = new Set(prev);
          next.delete(card.id);
          return next;
        });
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCard = async (cardId: string, cardName: string) => {
    const element = document.getElementById(`card-${cardId}`);
    if (!element) return;
    try {
      const dataUrl = await toJpeg(element, { 
        pixelRatio: 3, // High quality for single image export
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `${cardName.replace(/\s+/g, '-').toLowerCase()}-card.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download card image:", err);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pages = document.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        
        const imgData = await toJpeg(page, { 
          pixelRatio: 2, 
          backgroundColor: '#ffffff'
        });
        
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      }
      
      pdf.save('card-forge-export.pdf');
    } catch (err) {
      console.error("PDF Export failed:", err);
      setError("PDF Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Chunk cards into groups of 8 for A4 landscape pages
  const chunkedCards = [];
  for (let i = 0; i < cards.length; i += 8) {
    chunkedCards.push(cards.slice(i, i + 8));
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-sm">
            CF
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Card Forge</h1>
            <p className="text-xs text-stone-500 mt-1">AI Trading Card Generator</p>
          </div>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={cards.length === 0 || isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
        >
          {isExporting ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isExporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </header>

      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200 space-y-6">
            
            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-200">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${useAI ? 'bg-indigo-100 text-indigo-600' : 'bg-stone-200 text-stone-600'}`}>
                  {useAI ? <Wand2 className="w-5 h-5" /> : <Shapes className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Bildgenerierung</h3>
                  <p className="text-xs text-stone-500">{useAI ? 'KI-Illustrationen' : 'Geometrische Symbole'}</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {useAI && (
              <>
                <div>
                  <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Palette className="w-5 h-5 text-indigo-600" />
                    Bildstil (Global)
                  </h2>
                  <p className="text-sm text-stone-500 mb-2">
                    Dieser Text wird an jeden Bild-Prompt angehängt, um den allgemeinen Stil der Karten zu steuern.
                  </p>
                  <textarea
                    value={globalStyle}
                    onChange={(e) => setGlobalStyle(e.target.value)}
                    className="w-full h-24 p-3 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                    placeholder="z.B. Anime Stil, düster, Wasserfarben..."
                  />
                </div>
                <hr className="border-stone-100" />
              </>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-2">Input CSV Data</h2>
              <p className="text-sm text-stone-500 mb-4">
                Provide your card data in CSV format. Required columns: <code className="bg-stone-100 px-1 py-0.5 rounded">Element</code>, <code className="bg-stone-100 px-1 py-0.5 rounded">Kartentyp</code>, <code className="bg-stone-100 px-1 py-0.5 rounded">Cost</code>, <code className="bg-stone-100 px-1 py-0.5 rounded">Name</code>, <code className="bg-stone-100 px-1 py-0.5 rounded">Text</code>.
              </p>
              
              <textarea
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                className="w-full h-64 p-3 font-mono text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y whitespace-pre"
                placeholder="Element,Kartentyp,Cost,Name,Text..."
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-start gap-2 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !csvInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  Generate Cards
                </>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-8">
          {cards.length === 0 ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-stone-400 border-2 border-dashed border-stone-200 rounded-2xl">
              <Wand2 className="w-12 h-12 mb-4 opacity-20" />
              <p>Enter CSV data and click generate to see your cards.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {cards.map((card) => (
                <div key={card.id} className="flex flex-col items-center gap-3">
                  <PlayingCard 
                    card={card} 
                    onRegenerate={() => handleRegenerateImage(card.id)}
                    isRegenerating={regeneratingIds.has(card.id)}
                  />
                  <button 
                    onClick={() => handleDownloadCard(card.id, card.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-50 shadow-sm transition-colors print:hidden"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Als Bild speichern
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Hidden PDF Export Container */}
      <div className="absolute top-[-10000px] left-[-10000px]">
        {chunkedCards.map((chunk, pageIndex) => (
          <div 
            key={`pdf-page-${pageIndex}`}
            className="pdf-page bg-white" 
            style={{ 
              width: '297mm', 
              height: '210mm', 
              padding: '10mm', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gridTemplateRows: 'repeat(2, 1fr)', 
              gap: '0',
              placeItems: 'center',
              boxSizing: 'border-box'
            }}
          >
            {chunk.map(card => (
              <div key={`pdf-${card.id}`} className="relative flex items-center justify-center" style={{ width: '2.7in', height: '3.7in' }}>
                {/* Cut marks */}
                <div className="absolute top-0 left-[0.1in] w-px h-[0.1in] bg-black" />
                <div className="absolute top-[0.1in] left-0 w-[0.1in] h-px bg-black" />
                
                <div className="absolute top-0 right-[0.1in] w-px h-[0.1in] bg-black" />
                <div className="absolute top-[0.1in] right-0 w-[0.1in] h-px bg-black" />
                
                <div className="absolute bottom-0 left-[0.1in] w-px h-[0.1in] bg-black" />
                <div className="absolute bottom-[0.1in] left-0 w-[0.1in] h-px bg-black" />
                
                <div className="absolute bottom-0 right-[0.1in] w-px h-[0.1in] bg-black" />
                <div className="absolute bottom-[0.1in] right-0 w-[0.1in] h-px bg-black" />
                
                <PlayingCard card={card} onRegenerate={() => {}} isRegenerating={false} isPdf={true} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
