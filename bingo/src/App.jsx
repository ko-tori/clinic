import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Trophy, ShieldCheck, Info, X, CheckCircle2,
  RefreshCw, UserPlus, Download, Sparkles, Lock,
  Award, Phone, User, Plus, Search, Flame, Wifi, AlertCircle
} from 'lucide-react';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const WINNING_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
];

const SKILL_RULES = {
  Intermediate: {
    headline: 'Intermediate Marking Rules',
    instruction:
      'Intermediate players must keep the ball in play. Intermediate players will be subbed out if they make mistakes. Do not mark a square if you made a mistake.'
  }
};

const normalizePhone = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
};

function evaluateCard(squares) {
  if (!squares || squares.length !== 25) return { bingoCount: 0, isCoverall: false, winningIndices: new Set() };
  const winningIndices = new Set();
  let bingoCount = 0;

  for (const line of WINNING_LINES) {
    if (line.every((idx) => squares[idx]?.marked)) {
      bingoCount++;
      line.forEach((idx) => winningIndices.add(idx));
    }
  }
  const isCoverall = squares.every((sq) => sq?.marked);
  return { bingoCount, isCoverall, winningIndices };
}

function generateBoard(actionsPool, skillLevel) {
  const filtered = actionsPool.filter((a) => a.level === skillLevel);
  if (filtered.length < 24) return null;

  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 24);
  const board = [];
  let actionIdx = 0;

  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      board.push({
        id: 'FREE',
        title: 'FREE SPACE',
        category: 'Court Bonus',
        description: 'Center court bonus square! Automatically marked for every player.',
        marked: true,
        isFree: true
      });
    } else {
      const act = chosen[actionIdx++];
      board.push({
        id: act.id,
        title: act.title,
        category: act.category,
        description: act.description,
        marked: false,
        isFree: false
      });
    }
  }
  return board;
}

export default function App() {
  const [view, setView] = useState('player'); // 'player' | 'admin'
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [players, setPlayers] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');

  // Player Login State
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activePlayerPhone, setActivePlayerPhone] = useState(() => localStorage.getItem('vb_active_phone') || '');

  // Modal & Admin Form State
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [inspectedPlayer, setInspectedPlayer] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLevel, setNewLevel] = useState('Beginner');
  const [bulkInput, setBulkInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingLevelFor, setSavingLevelFor] = useState(null);

  // Custom Action State
  const [actLevel, setActLevel] = useState('Beginner');
  const [actCategory, setActCategory] = useState('Serving & Receive');
  const [actTitle, setActTitle] = useState('');
  const [actDesc, setActDesc] = useState('');

  // Initial Load & Realtime Subscriptions
  useEffect(() => {
    let isMounted = true;

    async function fetchInitialData() {
      setLoading(true);
      const [playersRes, actionsRes] = await Promise.all([
        supabase.from('players').select('*').order('total_points', { ascending: false }),
        supabase.from('actions').select('*')
      ]);

      if (!isMounted) return;

      if (playersRes.error) {
        setDbError(`Supabase error (players): ${playersRes.error.message}`);
      } else {
        setPlayers(playersRes.data || []);
      }

      if (actionsRes.error) {
        setDbError(`Supabase error (actions): ${actionsRes.error.message}`);
      } else {
        setActions(
          (actionsRes.data || []).map((row) => ({
            id: row.id,
            level: row.skill_level,
            category: row.category,
            title: row.title,
            description: row.description
          }))
        );
      }
      setLoading(false);
    }

    fetchInitialData();

    const channel = supabase
      .channel('volleyball-bingo-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        (payload) => {
          setPlayers((prev) => {
            if (payload.eventType === 'INSERT') {
              return [...prev.filter((p) => p.phone !== payload.new.phone), payload.new];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((p) => (p.phone === payload.new.phone ? payload.new : p));
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.phone !== payload.old.phone);
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new;
            setActions((prev) => [
              ...prev.filter((a) => a.id !== row.id),
              {
                id: row.id,
                level: row.skill_level,
                category: row.category,
                title: row.title,
                description: row.description
              }
            ]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new;
            setActions((prev) =>
              prev.map((a) =>
                a.id === row.id
                  ? {
                    id: row.id,
                    level: row.skill_level,
                    category: row.category,
                    title: row.title,
                    description: row.description
                  }
                  : a
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setActions((prev) => prev.filter((a) => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const currentPlayer = useMemo(
    () => players.find((p) => p.phone === activePlayerPhone) || null,
    [players, activePlayerPhone]
  );

  const activeSkillRule = useMemo(() => {
    if (!currentPlayer) return null;
    return SKILL_RULES[currentPlayer.skill_level] || SKILL_RULES.Beginner;
  }, [currentPlayer]);

  // Player Login Handler
  const handlePlayerLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    const norm = normalizePhone(loginPhone);
    if (!norm) {
      setLoginError('Please enter a valid phone number.');
      return;
    }
    const found = players.find((p) => p.phone === norm);
    if (!found) {
      setLoginError('Phone number not found in the preregistered roster. Ask your organizer to register you.');
      return;
    }
    if (loginName.trim() && found.name.toLowerCase() !== loginName.trim().toLowerCase()) {
      setLoginError(`That phone number is registered under "${found.name}". Please check your name or phone.`);
      return;
    }
    setActivePlayerPhone(found.phone);
    localStorage.setItem('vb_active_phone', found.phone);
  };

  const handleLogout = () => {
    setActivePlayerPhone('');
    localStorage.removeItem('vb_active_phone');
    setLoginName('');
    setLoginPhone('');
  };

  // Deal initial card OR claim completed Bingo/Coverall for a new card
  const handleDealOrClaimCard = async () => {
    if (!currentPlayer) return;

    const hasCard = Array.isArray(currentPlayer.active_card) && currentPlayer.active_card.length === 25;
    const { bingoCount, isCoverall } = hasCard
      ? evaluateCard(currentPlayer.active_card)
      : { bingoCount: 0, isCoverall: false };

    if (hasCard && bingoCount === 0 && !isCoverall) {
      return;
    }

    const newBoard = generateBoard(actions, currentPlayer.skill_level);
    if (!newBoard) {
      setDbError(
        `Not enough "${currentPlayer.skill_level}" actions in Supabase (need at least 24). Please seed the actions table.`
      );
      return;
    }

    const earnedBingos = hasCard ? (bingoCount > 0 ? 1 : 0) : 0;
    const earnedCoveralls = hasCard ? (isCoverall ? 1 : 0) : 0;
    const pointsAdded = isCoverall ? 500 : bingoCount > 0 ? 100 : 0;

    const updatedFields = {
      active_card: newBoard,
      bingos: (currentPlayer.bingos || 0) + earnedBingos,
      coveralls: (currentPlayer.coveralls || 0) + earnedCoveralls,
      total_points: (currentPlayer.total_points || 0) + pointsAdded,
      updated_at: new Date().toISOString()
    };

    setPlayers((prev) =>
      prev.map((p) => (p.phone === currentPlayer.phone ? { ...p, ...updatedFields } : p))
    );

    const { error } = await supabase
      .from('players')
      .update(updatedFields)
      .eq('phone', currentPlayer.phone);

    if (error) setDbError(error.message);
  };

  // Toggle Square on Player's Card
  const handleToggleSquare = async (index) => {
    if (!currentPlayer || !currentPlayer.active_card) return;
    if (index === 12) return;

    const updatedCard = currentPlayer.active_card.map((sq, idx) =>
      idx === index ? { ...sq, marked: !sq.marked } : sq
    );

    setPlayers((prev) =>
      prev.map((p) => (p.phone === currentPlayer.phone ? { ...p, active_card: updatedCard } : p))
    );

    const { error } = await supabase
      .from('players')
      .update({ active_card: updatedCard, updated_at: new Date().toISOString() })
      .eq('phone', currentPlayer.phone);

    if (error) setDbError(error.message);
  };

  // Admin: Register Single Player
  const handleRegisterPlayer = async (e) => {
    e.preventDefault();
    const norm = normalizePhone(newPhone);
    if (!newName.trim() || !norm) return;

    const payload = {
      phone: norm,
      name: newName.trim(),
      skill_level: newLevel,
      active_card: null,
      bingos: 0,
      coveralls: 0,
      total_points: 0
    };

    const { error } = await supabase.from('players').upsert(payload, { onConflict: 'phone' });
    if (error) {
      setDbError(error.message);
    } else {
      setNewName('');
      setNewPhone('');
    }
  };

  // Admin: Update Existing Player Skill Level
  const handleUpdatePlayerLevel = async (phone, updatedLevel) => {
    setSavingLevelFor(phone);
    setPlayers((prev) =>
      prev.map((p) => (p.phone === phone ? { ...p, skill_level: updatedLevel } : p))
    );

    const { error } = await supabase
      .from('players')
      .update({ skill_level: updatedLevel, updated_at: new Date().toISOString() })
      .eq('phone', phone);

    if (error) {
      setDbError(error.message);
    }
    setSavingLevelFor(null);
  };

  // Admin: Bulk Paste Roster (Name, Phone, SkillLevel)
  const handleBulkImport = async () => {
    const lines = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const rows = [];
    for (const line of lines) {
      const parts = line.split(',').map((s) => s.trim());
      if (parts.length >= 2) {
        const norm = normalizePhone(parts[1]);
        const lvl = parts[2]?.toLowerCase().startsWith('int') ? 'Intermediate' : 'Beginner';
        if (parts[0] && norm) {
          rows.push({
            phone: norm,
            name: parts[0],
            skill_level: lvl,
            active_card: null,
            bingos: 0,
            coveralls: 0,
            total_points: 0
          });
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('players').upsert(rows, { onConflict: 'phone' });
      if (error) setDbError(error.message);
      else setBulkInput('');
    }
  };

  // Admin: Add Custom Action
  const handleAddCustomAction = async (e) => {
    e.preventDefault();
    if (!actTitle.trim() || !actDesc.trim()) return;
    const newAct = {
      id: `custom_${Date.now()}`,
      skill_level: actLevel,
      category: actCategory,
      title: actTitle.trim(),
      description: actDesc.trim()
    };
    const { error } = await supabase.from('actions').insert(newAct);
    if (error) setDbError(error.message);
    else {
      setActTitle('');
      setActDesc('');
    }
  };

  // Admin: Export CSV
  const handleExportCSV = () => {
    const headers = ['Name', 'Phone', 'Skill Level', 'Bingos', 'Coveralls', 'Total Points', 'Squares Marked'];
    const rows = players.map((p) => {
      const markedCount = Array.isArray(p.active_card)
        ? p.active_card.filter((s) => s.marked).length
        : 0;
      return [
        `"${p.name}"`,
        p.phone,
        p.skill_level,
        p.bingos || 0,
        p.coveralls || 0,
        p.total_points || 0,
        `${markedCount}/25`
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volleyball-bingo-scores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const cardStatus = useMemo(() => {
    if (!currentPlayer?.active_card) return { bingoCount: 0, isCoverall: false, winningIndices: new Set() };
    return evaluateCard(currentPlayer.active_card);
  }, [currentPlayer]);

  const canRequestNewCard =
    currentPlayer &&
    (!currentPlayer.active_card || cardStatus.bingoCount > 0 || cardStatus.isCoverall);

  const sortedLeaderboard = useMemo(() => {
    const qLower = searchQuery.toLowerCase();
    const qDigits = normalizePhone(searchQuery);
    return [...players]
      .filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          (qDigits && p.phone.includes(qDigits))
      )
      .sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
  }, [players, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-700 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-slate-700/20">
              &#x1F3D0;
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight">
                Clinic Bingo
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setView('player')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${view === 'player'
                ? 'bg-mauve-300 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white'
                }`}
            >
              Player Arena
            </button>
            <button
              onClick={() => setView('admin')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition ${view === 'admin'
                ? 'bg-mauve-300 text-slate-950 font-semibold shadow'
                : 'text-slate-300 hover:text-white'
                }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Coach Dashboard
            </button>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="bg-rose-950/80 border border-rose-700 text-rose-200 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{dbError}</span>
            <button onClick={() => setDbError('')} className="text-rose-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PLAYER ARENA VIEW */}
      {view === 'player' && (
        <main className="max-w-4xl mx-auto px-4 py-6">
          {loading ? (
            <div className="text-center py-20 text-slate-400">Connecting to live court roster...</div>
          ) : !currentPlayer ? (
            <div className="max-w-md mx-auto mt-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-mauve-300/15 text-mauve-200 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold">Player Check-In</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Enter your preregistered name and phone number to load your skill-matched bingo card.
                </p>
              </div>

              <form onSubmit={handlePlayerLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jordan Taylor"
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-mauve-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. (312) 555-0199"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-mauve-300"
                    />
                  </div>
                </div>

                {loginError && (
                  <p className="text-xs text-rose-400 bg-rose-950/50 border border-rose-800/70 p-3 rounded-xl">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-mauve-300 hover:bg-mauve-200 text-slate-950 font-bold py-2.5 rounded-xl transition shadow-lg shadow-mauve-300/20"
                >
                  Enter Court
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Player Status Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{currentPlayer.name}</h2>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${currentPlayer.skill_level === 'Intermediate'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                    >
                      {currentPlayer.skill_level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Score: <strong className="text-mauve-200">{currentPlayer.total_points || 0} pts</strong> •{' '}
                    Bingos: <strong className="text-white">{currentPlayer.bingos || 0}</strong> •{' '}
                    Coveralls: <strong className="text-white">{currentPlayer.coveralls || 0}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {canRequestNewCard ? (
                    <button
                      onClick={handleDealOrClaimCard}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
                    >
                      <Sparkles className="w-4 h-4" />
                      {!currentPlayer.active_card
                        ? 'Request Initial 5×5 Card'
                        : cardStatus.isCoverall
                          ? 'Claim Coverall (+500 pts) & New Card'
                          : 'Claim Bingo (+100 pts) & New Card'}
                    </button>
                  ) : (
                    <div
                      title="You can only request a new card after completing a Bingo (5-in-a-row) or Coverall."
                      className="bg-slate-800/80 border border-slate-700 text-slate-400 text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 select-none"
                    >
                      <Lock className="w-3.5 h-3.5 text-mauve-200" />
                      <span>Card Locked Until Bingo / Coverall</span>
                    </div>
                  )}

                  <button
                    onClick={handleLogout}
                    className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl border border-slate-800 hover:border-slate-700"
                  >
                    Switch Player
                  </button>
                </div>
              </div>

              {/* Skill-Specific Marking Instructions Banner */}
              {activeSkillRule && (
                <div
                  className={`rounded-2xl p-3.5 sm:p-4 border flex items-start gap-3 ${currentPlayer.skill_level === 'Intermediate'
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-100'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100'
                    }`}
                >
                  <AlertCircle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${currentPlayer.skill_level === 'Intermediate' ? 'text-indigo-400' : 'text-emerald-400'
                      }`}
                  />
                  <div className="text-xs sm:text-sm leading-relaxed">
                    <span className="font-bold block">{activeSkillRule.headline}</span>
                    <span className="text-slate-200">{activeSkillRule.instruction}</span>
                  </div>
                </div>
              )}

              {/* Win Banner */}
              {currentPlayer.active_card && (cardStatus.bingoCount > 0 || cardStatus.isCoverall) && (
                <div className="bg-gradient-to-r from-mauve-300/20 via-emerald-500/20 to-mauve-300/20 border border-mauve-200/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Flame className="w-6 h-6 text-mauve-200 shrink-0" />
                    <div>
                      <h3 className="font-bold text-mauve-300">
                        {cardStatus.isCoverall
                          ? 'COVERALL COMPLETE! All 25 Squares Marked!'
                          : `BINGO! (${cardStatus.bingoCount} line${cardStatus.bingoCount > 1 ? 's' : ''} completed)`}
                      </h3>
                      <p className="text-xs text-slate-300">
                        {cardStatus.isCoverall
                          ? 'Claim your +500 Coverall bonus now to deal a fresh board!'
                          : 'Claim your +100 Bingo points for a fresh card now, or keep playing this card to go for a Coverall (+500 pts).'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 5x5 Bingo Grid */}
              {!currentPlayer.active_card ? (
                <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl p-12 text-center">
                  <Trophy className="w-10 h-10 text-mauve-200 mx-auto mb-3" />
                  <h3 className="text-lg font-bold">Ready to Take the Court?</h3>
                  <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    Click below to generate your personalized 5×5{' '}
                    <span className="text-white font-semibold">{currentPlayer.skill_level}</span> bingo card
                    with a center Free Space.
                  </p>
                  <button
                    onClick={handleDealOrClaimCard}
                    className="bg-mauve-300 hover:bg-mauve-200 text-slate-950 font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 shadow-lg shadow-mauve-300/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Deal My 5×5 Card
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
                  {currentPlayer.active_card.map((sq, idx) => {
                    const isWinning = cardStatus.winningIndices.has(idx);
                    return (
                      <div
                        key={idx}
                        onClick={() => handleToggleSquare(idx)}
                        className={`relative aspect-square rounded-xl sm:rounded-2xl p-1.5 sm:p-3 flex flex-col justify-between border transition cursor-pointer select-none ${sq.isFree
                          ? 'bg-mauve-300/20 border-mauve-200 text-mauve-200'
                          : sq.marked
                            ? isWinning
                              ? 'bg-emerald-500/30 border-emerald-400 text-white shadow-lg shadow-emerald-500/15'
                              : 'bg-indigo-600/30 border-indigo-400 text-white'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-600 text-slate-200'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 truncate">
                            {sq.isFree ? 'BONUS' : sq.category.split(' ')[0]}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSquare(sq);
                            }}
                            title="View skill description"
                            className="p-1 rounded-lg bg-slate-950/60 hover:bg-slate-950 text-slate-300 hover:text-mauve-200 transition shrink-0"
                          >
                            <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>

                        <div className="text-[11px] sm:text-xs md:text-sm font-bold leading-snug text-center line-clamp-3 my-auto">
                          {sq.title}
                        </div>

                        <div className="flex justify-center h-3.5">
                          {sq.marked && (
                            <CheckCircle2
                              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${sq.isFree ? 'text-mauve-200' : 'text-emerald-400'
                                }`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* COACH / ORGANIZER DASHBOARD VIEW */}
      {view === 'admin' && (
        <main className="max-w-6xl mx-auto px-4 py-6">
          {!adminUnlocked ? (
            <div className="max-w-sm mx-auto mt-10 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <ShieldCheck className="w-10 h-10 text-mauve-200 mx-auto mb-2" />
              <h2 className="text-lg font-bold">Coach / Organizer Access</h2>
              <p className="text-xs text-slate-400 mt-1 mb-4">Enter organizer PIN</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pinInput === '0205') {
                    setAdminUnlocked(true);
                    setPinError('');
                  } else {
                    setPinError('Incorrect PIN.');
                  }
                }}
                className="space-y-3"
              >
                <input
                  type="password"
                  placeholder="PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center tracking-widest text-sm focus:outline-none focus:border-mauve-300"
                />
                {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
                <button
                  type="submit"
                  className="w-full bg-mauve-300 hover:bg-mauve-200 text-slate-950 font-bold py-2.5 rounded-xl text-sm"
                >
                  Unlock Dashboard
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Registration & Custom Action Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Preregister Players */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-mauve-200" />
                    <h3 className="font-bold">Preregister Players & Assign Skill Level</h3>
                  </div>

                  <form onSubmit={handleRegisterPlayer} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Player Name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="Phone Number"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newLevel}
                        onChange={(e) => setNewLevel(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-sm flex-1"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                      </select>
                      <button
                        type="submit"
                        className="bg-mauve-300 hover:bg-mauve-200 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </form>

                  <div className="pt-2 border-t border-slate-800">
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Bulk Import (one per line:{' '}
                      <code className="text-slate-300">Name, Phone, Beginner/Intermediate</code>)
                    </label>
                    <textarea
                      rows={3}
                      placeholder={'Alex Rivera, 3125550101, Beginner\nSam Chen, 3125550102, Intermediate'}
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      className="mt-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl"
                    >
                      Import Roster Lines
                    </button>
                  </div>
                </div>

                {/* Add Custom Skill Action */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plus className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold">Add Custom Bingo Action</h3>
                    </div>
                    <span className="text-xs text-slate-400">
                      DB Pool: {actions.filter((a) => a.level === 'Beginner').length} Beg /{' '}
                      {actions.filter((a) => a.level === 'Intermediate').length} Int
                    </span>
                  </div>

                  <form onSubmit={handleAddCustomAction} className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <select
                        value={actLevel}
                        onChange={(e) => setActLevel(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value="Beginner">Beginner Pool</option>
                        <option value="Intermediate">Intermediate Pool</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Category (e.g. Serving)"
                        value={actCategory}
                        onChange={(e) => setActCategory(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Short Square Title (e.g. Jump Topspin Ace)"
                      value={actTitle}
                      onChange={(e) => setActTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Full Modal Description..."
                      value={actDesc}
                      onChange={(e) => setActDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl"
                    >
                      Save Action to Database
                    </button>
                  </form>
                </div>
              </div>

              {/* Live Scoreboard & Progress Tracker */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-mauve-200" />
                    <h3 className="font-bold text-base">Live Player Leaderboard & Card Progress</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Filter player..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs"
                      />
                    </div>
                    <button
                      onClick={handleExportCSV}
                      className="bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                        <th className="py-2.5 px-3">Player</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Skill Level (Edit)</th>
                        <th className="py-2.5 px-3">Active Card</th>
                        <th className="py-2.5 px-3 text-center">Bingos</th>
                        <th className="py-2.5 px-3 text-center">Coveralls</th>
                        <th className="py-2.5 px-3 text-right">Total Points</th>
                        <th className="py-2.5 px-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {sortedLeaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                            No players registered yet. Add players above to begin.
                          </td>
                        </tr>
                      ) : (
                        sortedLeaderboard.map((p) => {
                          const markedCount = Array.isArray(p.active_card)
                            ? p.active_card.filter((s) => s.marked).length
                            : 0;
                          return (
                            <tr key={p.phone} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 font-semibold">{p.name}</td>
                              <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">{p.phone}</td>
                              <td className="py-2.5 px-3">
                                <select
                                  aria-label={`Skill level for ${p.name}`}
                                  disabled={savingLevelFor === p.phone}
                                  value={p.skill_level}
                                  onChange={(e) => handleUpdatePlayerLevel(p.phone, e.target.value)}
                                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none ${p.skill_level === 'Intermediate'
                                    ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40'
                                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                                    }`}
                                >
                                  <option value="Beginner" className="bg-slate-900 text-emerald-300">
                                    Beginner
                                  </option>
                                  <option value="Intermediate" className="bg-slate-900 text-indigo-300">
                                    Intermediate
                                  </option>
                                </select>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-slate-300">
                                {p.active_card ? `${markedCount}/25 marked` : 'Not dealt yet'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-semibold">{p.bingos || 0}</td>
                              <td className="py-2.5 px-3 text-center font-semibold">{p.coveralls || 0}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-mauve-200">
                                {p.total_points || 0}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {p.active_card && (
                                  <button
                                    onClick={() => setInspectedPlayer(p)}
                                    className="text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg"
                                  >
                                    View Card
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Skill Description Modal */}
      {selectedSquare && (
        <div
          onClick={() => setSelectedSquare(null)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-mauve-200">
                  {selectedSquare.category}
                </span>
                <h3 className="text-lg font-bold mt-0.5">{selectedSquare.title}</h3>
              </div>
              <button
                onClick={() => setSelectedSquare(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-300 mt-4 leading-relaxed">{selectedSquare.description}</p>

            {/* Skill-Level Verification Reminder inside Modal */}
            {!selectedSquare.isFree && activeSkillRule && (
              <div
                className={`mt-4 p-3 rounded-xl border text-xs leading-relaxed ${currentPlayer?.skill_level === 'Intermediate'
                  ? 'bg-indigo-950/50 border-indigo-500/30 text-indigo-200'
                  : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-200'
                  }`}
              >
                <strong className="block mb-0.5">{activeSkillRule.headline}:</strong>
                {activeSkillRule.instruction}
              </div>
            )}

            <button
              onClick={() => setSelectedSquare(null)}
              className="mt-6 w-full bg-mauve-300 hover:bg-mauve-200 text-slate-950 font-bold py-2.5 rounded-xl text-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Admin Live Card Inspection Modal */}
      {inspectedPlayer && (
        <div
          onClick={() => setInspectedPlayer(null)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">{inspectedPlayer.name}&apos;s Live Card</h3>
                <p className="text-xs text-slate-400">
                  {inspectedPlayer.skill_level} • {inspectedPlayer.total_points || 0} pts
                </p>
              </div>
              <button
                onClick={() => setInspectedPlayer(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {inspectedPlayer.active_card?.map((sq, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg border text-[10px] text-center flex items-center justify-center aspect-square ${sq.marked
                    ? 'bg-emerald-500/25 border-emerald-500 text-white font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                >
                  {sq.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}