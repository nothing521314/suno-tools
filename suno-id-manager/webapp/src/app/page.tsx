"use client";

import { useState, useEffect } from "react";
import copy from "copy-to-clipboard";
import toast, { Toaster } from "react-hot-toast";
import { 
  Search, 
  Plus, 
  Trash2, 
  Clipboard, 
  User, 
  Play, 
  Music, 
  ExternalLink, 
  ListPlus,
  Info,
  CheckCircle2,
  PanelLeftOpen,
  X
} from "lucide-react";

interface SongResult {
  title: string;
  artist: string;
  image?: string;
  claim_id: string;
  fake_name?: string;
  tiktok_url: string;
}

interface QueueItem {
  fake_name: string;
  claim_id: string;
}

export default function Home() {
  const [results, setResults] = useState<SongResult[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [fakeName, setFakeName] = useState("");
  const [claimId, setClaimId] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Use relative path since we have a proxy in next.config.ts
  const API_BASE = "/api";

  const fetchData = async () => {
    try {
      const resResults = await fetch(`${API_BASE}/results`);
      if (resResults.ok) {
        const dataResults = await resResults.json();
        setResults(dataResults);
      }

      const resQueue = await fetch(`${API_BASE}/queue`);
      if (resQueue.ok) {
        const dataQueue = await resQueue.json();
        setQueue(dataQueue);
      }

      const resStatus = await fetch(`${API_BASE}/status`);
      if (resStatus.ok) {
        const dataStatus = await resStatus.json();
        setIsRunning(dataStatus.is_running);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  useEffect(() => {
    setIsClient(true);
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const addToQueue = async () => {
    if (!claimId) {
      toast.error("Vui lòng nhập TikTok Claim ID");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fake_name: fakeName || "Không có", claim_id: claimId }),
      });
      if (res.ok) {
        toast.success("Đã thêm vào hàng chờ");
        setFakeName("");
        setClaimId("");
        fetchData();
      }
    } catch (err) {
      toast.error("Lỗi khi thêm vào hàng chờ");
    }
  };

  const addBulkToQueue = async () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n");
    const items: QueueItem[] = [];
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Tách lấy cụm số cuối cùng làm ID, phần còn lại là Tên giả
      const match = trimmed.match(/^(.*)[\s\t]+(\d+)$/);
      if (match) {
        items.push({ fake_name: match[1].trim(), claim_id: match[2].trim() });
      } else if (/^\d+$/.test(trimmed)) {
        // Nếu chỉ có ID
        items.push({ fake_name: "Không có", claim_id: trimmed });
      }
    });

    if (items.length === 0) {
      toast.error("Không tìm thấy ID nào hợp lệ");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/queue/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (res.ok) {
        toast.success(`Đã thêm ${items.length} mục vào hàng chờ`);
        setBulkText("");
        fetchData();
      }
    } catch (err) {
      toast.error("Lỗi khi thêm hàng chờ hàng loạt");
    }
  };

  const startProcessing = async () => {
    try {
      const res = await fetch(`${API_BASE}/run`, { method: "POST" });
      if (res.ok) {
        toast.success("Bắt đầu quét danh sách...");
        setIsRunning(true);
      }
    } catch (err) {
      toast.error("Lỗi khi bắt đầu quét");
    }
  };

  const clearQueue = async () => {
    if (!confirm("Xóa toàn bộ hàng chờ?")) return;
    try {
      const res = await fetch(`${API_BASE}/queue/clear`, { method: "POST" });
      if (res.ok) {
        toast.success("Đã xóa hàng chờ");
        fetchData();
      }
    } catch (err) {
      toast.error("Lỗi khi xóa hàng chờ");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    const success = copy(text);
    if (success) {
      toast.success(`Đã copy ${label}: ${text}`, {
        icon: '📋',
        duration: 2000,
      });
    } else {
      toast.error("Lỗi khi copy");
    }
  };

  const filteredResults = results.filter(
    (item) =>
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.fake_name && item.fake_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item.claim_id?.includes(searchTerm)
  );

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 font-sans flex flex-col lg:flex-row overflow-hidden">
      <Toaster position="bottom-right" />
      
      {/* Mobile Header & Toggle */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-indigo-400" />
            <span className="font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Suno ID</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 bg-indigo-600 rounded-lg text-white"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      </div>

      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Input & Queue) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[85%] max-w-[360px] bg-slate-900/95 backdrop-blur-2xl border-r border-slate-800 p-6 overflow-y-auto transition-transform duration-300 transform
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:static lg:w-[400px] lg:max-w-none lg:bg-slate-900/50 lg:block
      `}>
        <div className="flex items-center justify-between lg:hidden mb-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-indigo-400">Điều khiển</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-slate-800 rounded-full">
                <X className="w-5 h-5" />
            </button>
        </div>

        <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-2xl transition-all hover:border-slate-600">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2 rounded-xl">
                  <Plus className="w-5 h-5 text-indigo-400" />
                </div>
                Thêm lẻ
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Ghi chú (Tên giả)</label>
                  <input
                    type="text"
                    value={fakeName}
                    onChange={(e) => setFakeName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
                    placeholder="VD: Nhạc buồn chill..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">TikTok Claim ID *</label>
                  <input
                    type="text"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
                    placeholder="7603809163826711310"
                  />
                </div>
                <button
                  onClick={addToQueue}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Thêm vào Queue
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-700"></span>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase">
                    <span className="bg-[#121b2e] px-3 text-slate-500 font-black tracking-[0.2em]">Hoặc Nhập List</span>
                  </div>
                </div>

                <div>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs font-mono placeholder:text-slate-600"
                    placeholder={"Tên bài 1\t761582329...\nTên bài 2\t761598056..."}
                  />
                  <button
                    onClick={addBulkToQueue}
                    className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 active:scale-95 border border-slate-600/30"
                  >
                    <ListPlus className="w-4 h-4" /> Thêm List vào Queue
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className="bg-amber-500/20 p-2 rounded-xl">
                    <Play className="w-5 h-5 text-amber-400" />
                  </div>
                  Hàng chờ <span className="text-slate-500 font-normal">({queue.length})</span>
                </h2>
                {queue.length > 0 && (
                  <button onClick={clearQueue} className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
                {queue.map((item, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-900/40 p-3.5 rounded-2xl border border-slate-700/50 group hover:border-indigo-500/30 transition-colors">
                    <div className="overflow-hidden">
                      <p className="text-sm font-bold truncate text-indigo-300 group-hover:text-indigo-200 transition-colors">{item.fake_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.claim_id}</p>
                    </div>
                  </div>
                ))}
                {queue.length === 0 && (
                  <div className="text-center py-12 flex flex-col items-center gap-2 text-slate-500">
                    <Info className="w-8 h-8 opacity-20" />
                    <p className="text-sm italic">Hàng chờ trống</p>
                  </div>
                )}
              </div>
              
              <button
                  onClick={startProcessing}
                  disabled={isRunning || queue.length === 0}
                  className={`w-full mt-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                    isRunning
                      ? "bg-amber-500/10 text-amber-500 animate-pulse border border-amber-500/30"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/20 active:scale-[0.98]"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {isRunning ? "Đang xử lý dữ liệu..." : "Kích hoạt quét nhạc"}
                </button>
            </div>
        </div>
      </aside>

      {/* Main Content (Results) */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
        <div className="max-w-5xl mx-auto">
            <header className="hidden lg:block text-center mb-12 animate-in fade-in slide-in-from-top duration-700">
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4 tracking-tight">
                    Suno Music ID Manager
                </h1>
                <p className="text-slate-400 flex items-center justify-center gap-2">
                    <Music className="w-4 h-4 text-indigo-400" />
                    Quản lý và nhận diện bài hát từ TikTok ID
                </p>
            </header>

            <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center gap-4 animate-in fade-in duration-1000">
                    <div className="relative flex-1 w-full group">
                        <input
                            type="text"
                            placeholder="Tìm kiếm bài hát, ca sĩ, ID hoặc tên giả..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-800/40 border border-slate-700 rounded-2xl px-5 py-4 pl-14 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all shadow-xl group-hover:border-slate-600"
                        />
                        <Search className="absolute left-5 top-4.5 text-slate-500 w-5 h-5 group-hover:text-slate-400 transition-colors" />
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-wider whitespace-nowrap shadow-xl flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        Tổng: <span className="text-indigo-400 text-lg">{results.length}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredResults.map((item, i) => (
                        <div key={i} className="bg-slate-800/30 hover:bg-slate-800/50 transition-all p-5 rounded-[2.5rem] border border-slate-700/40 group flex flex-col h-full shadow-xl hover:shadow-2xl hover:-translate-y-1 duration-300">
                            <div className="flex gap-5 mb-5">
                                <div className="relative flex-shrink-0">
                                    {item.image ? (
                                        <img src={item.image} className="w-24 h-24 rounded-3xl object-cover shadow-2xl group-hover:rotate-3 transition-all duration-500" alt="" />
                                    ) : (
                                        <div className="w-24 h-24 bg-slate-700 rounded-3xl flex items-center justify-center text-4xl shadow-2xl group-hover:rotate-3 transition-all duration-500">
                                            <Music className="w-10 h-10 text-slate-500" />
                                        </div>
                                    )}
                                </div>
                                <div className="overflow-hidden flex-1 flex flex-col justify-center">
                                    <h3 className="font-black text-xl truncate mb-1 text-slate-100 group-hover:text-white transition-colors" title={item.title}>{item.title}</h3>
                                    <p className="text-slate-400 font-medium text-sm truncate mb-3">{item.artist}</p>
                                    {item.fake_name && (
                                        <div className="inline-flex items-center gap-1.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-xl border border-indigo-500/20 w-fit">
                                            <Search className="w-3 h-3" /> {item.fake_name}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex gap-2.5 mt-auto">
                                <button 
                                    onClick={() => copyToClipboard(item.title, "Tên bài")}
                                    className="flex-1 bg-slate-700/40 hover:bg-indigo-500 hover:text-white text-[11px] font-black uppercase tracking-widest py-3 rounded-2xl transition-all border border-slate-600/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Clipboard className="w-3.5 h-3.5" /> Tên bài
                                </button>
                                <button 
                                    onClick={() => copyToClipboard(item.artist, "Ca sĩ")}
                                    className="flex-1 bg-slate-700/40 hover:bg-purple-500 hover:text-white text-[11px] font-black uppercase tracking-widest py-3 rounded-2xl transition-all border border-slate-600/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <User className="w-3.5 h-3.5" /> Ca sĩ
                                </button>
                            </div>
                            
                            <div className="mt-5 flex justify-between items-center border-t border-slate-700/40 pt-5">
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-700/50">ID: {item.claim_id}</span>
                                <a 
                                    href={item.tiktok_url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-indigo-400 text-xs font-black uppercase tracking-widest hover:text-indigo-300 transition-colors flex items-center gap-1.5 group/link"
                                >
                                    TikTok <ExternalLink className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
                {filteredResults.length === 0 && (
                    <div className="text-center py-40 bg-slate-800/10 rounded-[3rem] border border-dashed border-slate-700/50 flex flex-col items-center gap-4 text-slate-600">
                        <Search className="w-12 h-12 opacity-10" />
                        <p className="text-lg font-medium italic">Không tìm thấy kết quả nào khớp với tìm kiếm.</p>
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}
