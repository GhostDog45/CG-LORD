'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type Entry = {
  id: string;
  cg: number;
  timestamp: number;
};

export default function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/cgs');
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Get the current user's ID from local storage
    const id = localStorage.getItem('user_id');
    if (id) setUserId(id);

    fetchLeaderboard();
    
    // Poll every 3 seconds for real-time updates
    const interval = setInterval(fetchLeaderboard, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#09090b] text-zinc-50 py-10 px-4 sm:px-8 md:px-12 lg:px-16 font-sans overflow-x-hidden w-full">
      <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1500px]">
        <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Leaderboard</h1>
            <p className="text-sm sm:text-base text-zinc-400 mt-1">Real-time anonymous rankings.</p>
          </div>
          <Link 
            href="/?edit=true" 
            className="text-sm sm:text-base px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-all shadow-sm font-medium"
          >
            Change CG
          </Link>
        </div>

        {loading && entries.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 animate-pulse text-lg">Loading rankings...</div>
        ) : (
          <div className="bg-[#18181b] rounded-2xl border border-zinc-800/50 overflow-hidden shadow-2xl shadow-indigo-500/5 w-full">
            {/* Header row */}
            <div className="grid grid-cols-[140px_1fr_auto] sm:grid-cols-[180px_1fr_auto] md:grid-cols-[220px_1fr_auto] gap-6 sm:gap-10 px-8 sm:px-12 md:px-16 py-5 sm:py-6 bg-zinc-900/50 text-zinc-400 text-sm uppercase tracking-wider border-b border-zinc-800/50 font-semibold">
              <div>Rank</div>
              <div>CG</div>
              <div className="text-right">Time Added</div>
            </div>
            
            {/* Animated List */}
            <div className="flex flex-col relative min-h-[200px]">
              <AnimatePresence>
                {entries.map((entry, index) => {
                  const isMe = entry.id === userId;
                  const date = new Date(entry.timestamp);
                  const isToday = new Date().toDateString() === date.toDateString();
                  
                  const timeString = isToday 
                    ? 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
                      key={entry.id}
                      className={`grid grid-cols-[140px_1fr_auto] sm:grid-cols-[180px_1fr_auto] md:grid-cols-[220px_1fr_auto] gap-6 sm:gap-10 px-8 sm:px-12 md:px-16 py-6 items-center border-b border-zinc-800/30 transition-colors hover:bg-zinc-800/40 ${isMe ? 'bg-indigo-900/10 relative' : ''}`}
                    >
                      {/* Highlight indicator for current user */}
                      {isMe && (
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-indigo-500 to-cyan-500 rounded-r-sm"></div>
                      )}
                      
                      <div>
                        <div className="flex items-center gap-4">
                          <span className={`font-mono text-xl sm:text-2xl ${index < 3 ? 'text-white font-bold' : 'text-zinc-500 font-medium'}`}>
                            #{index + 1}
                          </span>
                          {isMe && (
                            <span className="text-xs uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded font-bold shadow-sm">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className={`font-bold text-2xl sm:text-3xl tracking-tight ${isMe ? 'text-indigo-100' : 'text-zinc-300'}`}>
                        {entry.cg.toFixed(2)}
                      </div>
                      
                      <div className="text-right text-sm sm:text-base text-zinc-500 tabular-nums font-medium">
                        {timeString}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              
              {entries.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                  No entries yet. Be the first to add your CG!
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
