'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export default function Home() {
  const [cg, setCg] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'welcome' | 'loading' | 'form'>('welcome');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    if (window.location.search.includes('edit=true')) {
      setStep('form');
    }
    // Calculate device hardware/browser fingerprint
    FingerprintJS.load()
      .then((fp) => fp.get())
      .then((result) => setVisitorId(result.visitorId))
      .catch((err) => console.error('Fingerprint error:', err));
  }, []);

  useEffect(() => {
    if (step === 'loading') {
      const hasSubmitted = localStorage.getItem('user_id');
      const isEditing = window.location.search.includes('edit=true');
      
      if (hasSubmitted && !isEditing) {
        // Verify with server if this ID actually exists on the leaderboard
        fetch('/api/cgs')
          .then((res) => res.json())
          .then((entries: any[]) => {
            const exists = Array.isArray(entries) && entries.some((e) => e.id === hasSubmitted);
            if (exists) {
              setToastMessage('You have already submitted a CG.');
              setTimeout(() => {
                router.push('/leaderboard');
              }, 1000);
            } else {
              // Stale ID from another session/database reset. Clear it and show the form!
              localStorage.removeItem('user_id');
              localStorage.removeItem('user_token');
              setStep('form');
            }
          })
          .catch(() => {
            setStep('form');
          });
      } else {
        // Proceed to form
        const timer = setTimeout(() => {
          setStep('form');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [step, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(cg);
    if (isNaN(val) || val < 0 || val > 4) {
      setToastMessage("CG must be between 0 and 4");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    
    setLoading(true);
    
    let userId = localStorage.getItem('user_id');
    let userToken = localStorage.getItem('user_token');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('user_id', userId);
    }
    if (!userToken) {
      userToken = crypto.randomUUID();
      localStorage.setItem('user_token', userToken);
    }

    let currentFp = visitorId;
    if (!currentFp) {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        currentFp = result.visitorId;
      } catch (err) {
        console.error('Failed to get device fingerprint:', err);
      }
    }

    try {
      const res = await fetch('/api/cgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: userId, 
          cg: val, 
          secret_token: userToken, 
          fingerprint: currentFp 
        }),
      });
      
      if (res.ok) {
        router.push('/leaderboard');
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to submit CG. Please try again.' }));
        setToastMessage(data.error || 'Failed to submit CG.');
        
        if (res.status === 403) {
           setTimeout(() => router.push('/leaderboard'), 1000);
        } else {
           setTimeout(() => setToastMessage(null), 3000);
           setLoading(false);
        }
      }
    } catch (error) {
      console.error('Failed to submit', error);
      setToastMessage('Network error. Please try again.');
      setTimeout(() => setToastMessage(null), 3000);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] text-zinc-50 p-6 font-sans overflow-hidden">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -50, x: "-50%" }}
            className="fixed top-8 left-1/2 z-50 bg-rose-500/10 border border-rose-500/50 text-rose-200 px-6 py-3 rounded-full shadow-2xl backdrop-blur-md text-sm font-medium"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center cursor-pointer group w-full"
            onClick={() => setStep('loading')}
          >
            <div className="bg-white p-4 rounded-3xl shadow-2xl transition-transform group-hover:scale-[1.02] border-4 border-zinc-800">
              <img 
                src="/rat-race.jpg" 
                alt="Welcome to the rat race" 
                className="w-full max-w-3xl rounded-xl object-contain pointer-events-none select-none"
              />
            </div>
            <p className="mt-16 text-blue-400 text-sm tracking-widest uppercase animate-pulse font-semibold">
              Click anywhere to begin
            </p>
          </motion.div>
        )}

        {step === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center"
          >
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-8 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
            <h2 className="text-xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 tracking-tight">
              Entering the brain dead zone...
            </h2>
          </motion.div>
        )}

        {step === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="w-full max-w-md bg-[#18181b] p-8 rounded-2xl shadow-2xl border border-zinc-800/50 relative overflow-hidden"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-40"></div>
            
            <h1 className="text-3xl font-bold text-center mb-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
              Enter Your CG
            </h1>
            <p className="text-zinc-400 text-center mb-8 text-sm">Join the leaderboard and see where you stand.</p>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex justify-center">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  required
                  value={cg}
                  onChange={(e) => setCg(e.target.value)}
                  className="w-3/4 px-4 py-6 text-center rounded-2xl bg-zinc-900/50 border border-zinc-800 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all text-4xl font-semibold shadow-inner"
                  disabled={loading}
                />
              </div>
              
              <button
                type="submit"
                disabled={loading || !cg}
                className="w-full py-4 rounded-xl bg-indigo-600 text-white font-medium text-lg hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {loading ? (
                  <span className="animate-pulse">Submitting...</span>
                ) : (
                  'View Leaderboard'
                )}
              </button>
            </form>
            
            <div className="mt-8 text-center">
              <a href="/leaderboard" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                Just viewing? Go to leaderboard &rarr;
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
