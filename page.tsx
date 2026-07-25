'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const WORDS = {
  easy: [
    'cat', 'dog', 'house', 'tree', 'sun', 'moon', 'car', 'boat', 'fish',
    'bird', 'apple', 'cake', 'hat', 'shoe', 'ball', 'book', 'chair', 'door',
  ],
  medium: [
    'giraffe', 'helicopter', 'volcano', 'pineapple', 'robot', 'castle',
    'submarine', 'teapot', 'umbrella', 'dragon', 'pirate', 'octopus',
    'campfire', 'lighthouse', 'skateboard', 'snowman', 'tractor',
  ],
  hard: [
    'chandelier', 'nebula', 'labyrinth', 'orchestra', 'constellation',
    'camouflage', 'kaleidoscope', 'architecture', 'renaissance',
    'skyscraper', 'microscope', 'waterfall', 'magnificent', 'phenomenon',
  ],
};

const COLORS = [
  '#1a1a1a', '#e26d5f', '#6f7340', '#3d5a80', '#8e3b3b',
  '#c7a23d', '#5a8f7b', '#7a5a8f', '#ffffff',
];

const AVATARS = ['circle', 'square', 'triangle', 'diamond'];

// --- Types ---

type Room = {
  id: string;
  host_id: string;
  status: 'waiting' | 'choosing' | 'drawing' | 'round_end' | 'game_end';
  current_round: number;
  max_rounds: number;
  drawer_index: number;
  word: string | null;
  word_options: string[];
  round_started_at: string | null;
  round_ends_at: string | null;
};

type Player = {
  id: string;
  room_id: string;
  name: string;
  avatar: string;
  score: number;
  is_connected: boolean;
  last_seen_at: string;
};

type Stroke = {
  id: string;
  room_id: string;
  player_id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
};

type Message = {
  id: string;
  room_id: string;
  player_id: string;
  text: string;
  is_correct: boolean;
  created_at: string;
  player?: Player;
};

type Screen = 'home' | 'lobby' | 'game';

// --- Helpers ---

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function pickWordOptions() {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return [pick(WORDS.easy), pick(WORDS.medium), pick(WORDS.hard)];
}

function normalizeWord(text: string) {
  return text.toLowerCase().replace(/[^a-z]/g, '');
}

async function sb<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(text);
  }
  const json = await res.json().catch(() => null);
  return json;
}

function getAvatarShape(avatar: string, color: string) {
  if (avatar === 'square') return (
    <svg viewBox="0 0 40 40" className="w-10 h-10"><rect x="4" y="4" width="32" height="32" rx="10" fill={color} /></svg>
  );
  if (avatar === 'triangle') return (
    <svg viewBox="0 0 40 40" className="w-10 h-10"><polygon points="20,4 36,36 4,36" fill={color} /></svg>
  );
  if (avatar === 'diamond') return (
    <svg viewBox="0 0 40 40" className="w-10 h-10"><polygon points="20,2 38,20 20,38 2,20" fill={color} /></svg>
  );
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10"><circle cx="20" cy="20" r="16" fill={color} /></svg>
  );
}

function pastelForName(name: string) {
  const palette = ['#f2a65a', '#5a8f7b', '#7a5a8f', '#b15a32', '#3d5a80', '#c7a23d', '#8e3b3b', '#6f7340'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// --- Components ---

export default function SketchGuessPage() {
  const [screen, setScreen] = useState<Screen>('home');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [guess, setGuess] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [brushColor, setBrushColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStrokePoints, setCurrentStrokePoints] = useState<{ x: number; y: number }[]>([]);
  const [isEraser, setIsEraser] = useState(false);
  const [dark, setDark] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [pulseCorrect, setPulseCorrect] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const messageBoxRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const selectedWordRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId) || null, [players, myPlayerId]);
  const drawer = useMemo(() => {
    if (!room) return null;
    const raw = room.drawer_index % Math.max(players.length, 1);
    return players[raw] || null;
  }, [room, players]);
  const isDrawer = useMemo(() => drawer?.id === myPlayerId, [drawer, myPlayerId]);
  const isHost = useMemo(() => room?.host_id === myPlayerId, [room, myPlayerId]);

  // Sound
  function initAudio() {
    if (!audioCtxRef.current && typeof AudioContext !== 'undefined') {
      audioCtxRef.current = new AudioContext();
    }
    audioCtxRef.current?.resume();
  }

  function playTone(freq: number, type: OscillatorType, duration: number, vol = 0.08) {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playPop() { playTone(520, 'sine', 0.12, 0.1); }
  function playCorrect() { playTone(650, 'sine', 0.12, 0.12); setTimeout(() => playTone(950, 'sine', 0.22, 0.12), 90); }
  function playSwoosh() { playTone(180, 'triangle', 0.25, 0.1); }

  // Load previous session
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('sg_name');
      const savedPid = localStorage.getItem('sg_player_id');
      const savedRoom = localStorage.getItem('sg_room_id');
      const savedTheme = localStorage.getItem('sg_theme');
      if (savedName) setName(savedName);
      const prefersDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setDark(prefersDark);
      if (savedPid && savedRoom) {
        setMyPlayerId(savedPid);
        setRoomCode(savedRoom);
        rejoin(savedRoom, savedPid);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try { localStorage.setItem('sg_theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  const canvasBg = dark ? '#181b22' : '#fffaf0';
  const drawColor = isEraser ? canvasBg : brushColor;

  async function rejoin(code: string, pid: string) {
    setIsWorking(true);
    try {
      const rooms = await sb<Room[]>(`/rooms?id=eq.${code}`);
      if (!rooms || rooms.length === 0) {
        localStorage.removeItem('sg_player_id');
        localStorage.removeItem('sg_room_id');
        setMyPlayerId(null);
        setRoomCode('');
        setIsWorking(false);
        return;
      }
      // refresh player heartbeat
      await sb(`/players?id=eq.${pid}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_connected: true, last_seen_at: new Date().toISOString() }),
      });
      setRoomCode(code);
      setMyPlayerId(pid);
      setRoom(rooms[0]);
      setScreen(rooms[0].status === 'waiting' ? 'lobby' : 'game');
      fetchGameState();
    } catch {
      localStorage.removeItem('sg_player_id');
      localStorage.removeItem('sg_room_id');
      setMyPlayerId(null);
      setRoomCode('');
    } finally {
      setIsWorking(false);
    }
  }

  const fetchGameState = useCallback(async () => {
    if (!roomCode) return;
    try {
      const [roomData, playersData, strokesData, messagesData] = await Promise.all([
        sb<Room[]>(`/rooms?id=eq.${roomCode}`),
        sb<Player[]>(`/players?room_id=eq.${roomCode}&order=created_at.asc`),
        sb<Stroke[]>(`/strokes?room_id=eq.${roomCode}&order=created_at.asc`),
        sb<Message[]>(`/messages?room_id=eq.${roomCode}&order=created_at.asc`),
      ]);
      if (roomData && roomData[0]) {
        setRoom(roomData[0]);
        if (roomData[0].status === 'waiting') setScreen('lobby');
        else setScreen('game');
      } else {
        return;
      }
      setPlayers(playersData || []);
      setStrokes(strokesData || []);
      setMessages((messagesData || []).map((m: any) => ({ ...m, player: playersData?.find((p) => p.id === m.player_id) })));
    } catch (e) {
      console.error('poll error', e);
    }
  }, [roomCode]);

  // Polling
  useEffect(() => {
    if (screen === 'home' || !roomCode) return;
    fetchGameState();
    pollRef.current = window.setInterval(fetchGameState, 700) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [screen, roomCode, fetchGameState]);

  // Keep-alive
  useEffect(() => {
    if (!myPlayerId || !roomCode) return;
    const interval = window.setInterval(async () => {
      try {
        await sb(`/players?id=eq.${myPlayerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ last_seen_at: new Date().toISOString(), is_connected: true }),
        });
      } catch {}
    }, 8000);
    return () => window.clearInterval(interval);
  }, [myPlayerId, roomCode]);

  // Round timer
  useEffect(() => {
    if (!room?.round_ends_at) {
      setTimeLeft(0);
      return;
    }
    const tick = () => {
      const end = new Date(room.round_ends_at!).getTime();
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && room.status === 'drawing') {
        endRound(false);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [room?.round_ends_at, room?.status]);

  // Auto-scroll chat
  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // only resize if needed to avoid clearing too often
    if (Math.abs(canvas.width - rect.width * dpr) > 1 || Math.abs(canvas.height - rect.height * dpr) > 1) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    resizeCanvas();
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // dot grid
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : '#e4d9ca';
    for (let x = 0; x < rect.width; x += 24) {
      for (let y = 0; y < rect.height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const stroke of strokes) {
      drawPath(ctx, stroke.points, stroke.color, stroke.width);
    }
    if (currentStrokePoints.length > 1) {
      drawPath(ctx, currentStrokePoints, drawColor, brushSize);
    }
  }, [strokes, currentStrokePoints, brushColor, brushSize, canvasBg, dark]);

  function drawPath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function getCanvasPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startStroke(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawer || room?.status !== 'drawing') return;
    e.preventDefault();
    initAudio();
    const p = getCanvasPoint(e);
    if (!p) return;
    setIsDrawing(true);
    setCurrentStrokePoints([p]);
  }

  function moveStroke(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !isDrawer) return;
    e.preventDefault();
    const p = getCanvasPoint(e);
    if (!p) return;
    setCurrentStrokePoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) return prev;
      return [...prev, p];
    });
  }

  async function endStroke() {
    if (!isDrawing || !isDrawer || !roomCode || !myPlayerId) return;
    setIsDrawing(false);
    const points = [...currentStrokePoints];
    if (points.length < 2) {
      setCurrentStrokePoints([]);
      return;
    }
    try {
      await sb('/strokes', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomCode, player_id: myPlayerId, points, color: drawColor, width: brushSize }),
      });
      playSwoosh();
    } catch {}
    setCurrentStrokePoints([]);
  }

  async function createRoom() {
    initAudio();
    setError(null);
    setIsWorking(true);
    if (!name.trim()) {
      setError('Enter your name first.');
      setIsWorking(false);
      return;
    }
    try {
      const code = generateCode();
      const pid = uuid();
      await sb('/rooms', {
        method: 'POST',
        body: JSON.stringify({ id: code, host_id: pid, status: 'waiting', max_rounds: 5 }),
      });
      // verify room created before inserting player
      const rooms = await sb<Room[]>(`/rooms?id=eq.${code}`);
      if (!rooms || rooms.length === 0) throw new Error('Room creation failed.');
      await sb('/players', {
        method: 'POST',
        body: JSON.stringify({ id: pid, room_id: code, name: name.trim(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] }),
      });
      persist(code, pid);
      setRoomCode(code);
      setMyPlayerId(pid);
      setRoom(rooms[0]);
      setScreen('lobby');
      fetchGameState();
      playPop();
    } catch (e: any) {
      setError(e.message || 'Could not create room.');
    } finally {
      setIsWorking(false);
    }
  }

  async function joinRoom() {
    initAudio();
    const code = joinInput.trim().toUpperCase();
    setError(null);
    setIsWorking(true);
    if (!name.trim()) {
      setError('Enter your name first.');
      setIsWorking(false);
      return;
    }
    if (code.length < 4) {
      setError('Enter a valid room code.');
      setIsWorking(false);
      return;
    }
    try {
      const rooms = await sb<Room[]>(`/rooms?id=eq.${code}`);
      if (!rooms || rooms.length === 0) {
        setError('Room not found. Check the code and try again.');
        setIsWorking(false);
        return;
      }
      if (rooms[0].status !== 'waiting') {
        setError('That game already started.');
        setIsWorking(false);
        return;
      }
      const pid = uuid();
      await sb('/players', {
        method: 'POST',
        body: JSON.stringify({ id: pid, room_id: code, name: name.trim(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] }),
      });
      persist(code, pid);
      setRoomCode(code);
      setMyPlayerId(pid);
      setRoom(rooms[0]);
      setScreen('lobby');
      fetchGameState();
      playPop();
    } catch (e: any) {
      setError(e.message || 'Could not join room.');
    } finally {
      setIsWorking(false);
    }
  }

  function persist(code: string, pid: string) {
    try {
      localStorage.setItem('sg_name', name.trim());
      localStorage.setItem('sg_player_id', pid);
      localStorage.setItem('sg_room_id', code);
    } catch {}
  }

  async function startGame() {
    if (!roomCode || !isHost) return;
    if (players.length < 2) {
      setError('Need at least 2 players.');
      return;
    }
    setError(null);
    try {
      const options = pickWordOptions();
      await sb(`/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'choosing', word_options: options, current_round: 1, drawer_index: 0 }),
      });
      await sb(`/strokes?room_id=eq.${roomCode}`, { method: 'DELETE' });
      await sb(`/messages?room_id=eq.${roomCode}`, { method: 'DELETE' });
      fetchGameState();
      playSwoosh();
    } catch (e: any) {
      setError(e.message || 'Could not start.');
    }
  }

  async function selectWord(word: string) {
    if (!roomCode || !isDrawer) return;
    selectedWordRef.current = word;
    const endsAt = new Date(Date.now() + 80000).toISOString();
    try {
      await sb(`/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'drawing', word, word_options: [], round_started_at: new Date().toISOString(), round_ends_at: endsAt }),
      });
      fetchGameState();
      playPop();
    } catch {}
  }

  async function sendGuess() {
    const text = guess.trim();
    if (!text || !roomCode || !myPlayerId || !room?.word || isDrawer) return;
    const isCorrect = normalizeWord(text) === normalizeWord(room.word);

    try {
      await sb('/messages', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomCode, player_id: myPlayerId, text, is_correct: isCorrect }),
      });
      setGuess('');
      if (isCorrect) {
        playCorrect();
        setPulseCorrect(true);
        setGuessFeedback('Correct! 🎉');
        setTimeout(() => setPulseCorrect(false), 600);
        await awardPoints(drawer?.id || null, myPlayerId, timeLeft);
        setTimeout(() => endRound(true), 800);
      }
    } catch {}
  }

  async function awardPoints(drawerId: string | null, guesserId: string, remaining: number) {
    if (!roomCode) return;
    const guessBonus = Math.max(10, remaining * 2);
    const drawerBonus = 25;
    try {
      const guesser = players.find((p) => p.id === guesserId);
      if (guesser) {
        await sb(`/players?id=eq.${guesserId}`, { method: 'PATCH', body: JSON.stringify({ score: guesser.score + guessBonus }) });
      }
      if (drawerId) {
        const drawerP = players.find((p) => p.id === drawerId);
        if (drawerP) {
          await sb(`/players?id=eq.${drawerId}`, { method: 'PATCH', body: JSON.stringify({ score: drawerP.score + drawerBonus }) });
        }
      }
      fetchGameState();
    } catch {}
  }

  async function endRound(correct: boolean) {
    if (!roomCode || !isHost) return;
    try {
      await sb(`/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'round_end', word: room?.word }),
      });
      fetchGameState();
      setTimeout(() => nextTurnOrEnd(), 4500);
    } catch {}
  }

  async function nextTurnOrEnd() {
    if (!room || !roomCode || !isHost) return;
    const nextDrawerIndex = (room.drawer_index + 1) % Math.max(players.length, 1);
    const isNewRound = nextDrawerIndex === 0;
    if (isNewRound && room.current_round >= room.max_rounds) {
      await sb(`/rooms?id=eq.${roomCode}`, { method: 'PATCH', body: JSON.stringify({ status: 'game_end' }) });
    } else {
      const newRound = isNewRound ? room.current_round + 1 : room.current_round;
      const options = pickWordOptions();
      await sb(`/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'choosing',
          current_round: newRound,
          drawer_index: nextDrawerIndex,
          word: null,
          word_options: options,
          round_ends_at: null,
        }),
      });
      await sb(`/strokes?room_id=eq.${roomCode}`, { method: 'DELETE' });
      await sb(`/messages?room_id=eq.${roomCode}`, { method: 'DELETE' });
    }
    fetchGameState();
  }

  async function playAgain() {
    if (!roomCode || !isHost) return;
    try {
      const options = pickWordOptions();
      await sb(`/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'choosing', current_round: 1, drawer_index: 0, word: null, word_options: options, round_ends_at: null }),
      });
      await sb(`/players?room_id=eq.${roomCode}`, { method: 'PATCH', body: JSON.stringify({ score: 0 }) });
      await sb(`/strokes?room_id=eq.${roomCode}`, { method: 'DELETE' });
      await sb(`/messages?room_id=eq.${roomCode}`, { method: 'DELETE' });
      fetchGameState();
    } catch {}
  }

  async function leaveRoom() {
    if (!myPlayerId) return;
    try {
      await sb(`/players?id=eq.${myPlayerId}`, { method: 'DELETE' });
    } catch {}
    try {
      localStorage.removeItem('sg_player_id');
      localStorage.removeItem('sg_room_id');
    } catch {}
    window.location.reload();
  }

  function copyCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // --- Render ---

  return (
    <div className={`min-h-screen sketch-game-bg text-ink selection:bg-[var(--primary)] selection:text-white flex flex-col ${dark ? 'dark' : ''}`}>
      <button
        onClick={() => setDark((d) => !d)}
        className="fixed top-4 right-4 z-50 rounded-full bg-[var(--cream)] dark:bg-[var(--dark-card)] border-2 border-[var(--ink)] shadow-[0_3px_0_var(--ink)] w-11 h-11 flex items-center justify-center font-black transition hover:translate-y-px"
        aria-label="toggle theme"
        title="Toggle theme"
      >
        {dark ? '☀' : '☾'}
      </button>

      {/* HOME */}
      {screen === 'home' && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute inset-0 confetti opacity-50 pointer-events-none"></div>
          <div className="game-card max-w-md w-full p-8 md:p-10 relative z-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="text-5xl animate-bounce-soft">🎨</span>
              <h1 className="title-display text-[var(--candy)]">Sketch<br /><span className="text-[var(--lime)]">&amp; Guess</span></h1>
            </div>
            <p className="text-center text-lg text-[var(--ink)]/70 mb-8 font-medium">Draw with friends in real time. Be quick, be silly, win.</p>

            <label className="label">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pablo Pikaclick"
              className="input mb-6"
              maxLength={18}
              onKeyDown={(e) => { if (e.key === 'Enter') createRoom(); }}
            />

            <button
              onClick={createRoom}
              disabled={isWorking}
              className="big-btn primary w-full mb-3 disabled:opacity-60"
            >
              {isWorking ? 'Setting up…' : 'Create Room'}
            </button>

            <div className="relative text-center my-5">
              <span className="bg-[var(--cream)] px-3 text-sm font-bold uppercase tracking-wide text-[var(--ink)]/50">or join existing</span>
              <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-[var(--ink)]/10"></div></div>
            </div>

            <div className="flex gap-3">
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={8}
                className="input uppercase tracking-[0.2em] font-bold flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); }}
              />
              <button
                onClick={joinRoom}
                disabled={isWorking}
                className="big-btn lime px-6 disabled:opacity-60"
              >
                {isWorking ? '…' : 'Join'}
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-xl bg-rose-100 text-rose-800 px-4 py-3 text-sm font-semibold text-center border border-rose-200">
                {error}
              </div>
            )}
          </div>
        </main>
      )}

      {/* LOBBY */}
      {screen === 'lobby' && room && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
          <div className="game-card max-w-xl w-full p-6 md:p-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="title-small text-[var(--candy)]">Game Lobby</h2>
              <button onClick={leaveRoom} className="text-sm font-bold underline decoration-2 underline-offset-2 text-[var(--ink)]/60 hover:text-[var(--ink)]">Leave</button>
            </div>

            <div className="rounded-2xl bg-[var(--sky)] border-4 border-[var(--sky)]/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-inner mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-[var(--ink)]/60">Room Code</p>
                <p className="text-4xl md:text-5xl font-black tracking-[0.25em] text-[var(--ink)] drop-shadow-sm">{roomCode}</p>
              </div>
              <button onClick={copyCode} className="big-btn primary whitespace-nowrap">
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <p className="font-black text-[var(--ink)]/70">Players ({players.length})</p>
              <span className="text-xs font-black px-2 py-1 rounded-full bg-[var(--cream)] text-[var(--ink)]/60 border border-[var(--ink)]/10">need 2+ to start</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {players.map((p) => (
                <li key={p.id} className="player-chip">
                  <div className="scale-90 origin-left">{getAvatarShape(p.avatar, pastelForName(p.name))}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black truncate">{p.name} {p.id === myPlayerId && <span className="text-xs font-bold text-[var(--ink)]/50">(you)</span>}</p>
                    {p.id === room.host_id && <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[var(--candy)] text-white">HOST</span>}
                  </div>
                </li>
              ))}
              {players.length < 8 && (
                <li className="player-chip border-dashed border-[var(--ink)]/20 bg-[var(--cream)]/50 justify-center">
                  <p className="font-bold text-[var(--ink)]/40">Waiting for friends…</p>
                </li>
              )}
            </ul>

            {isHost ? (
              <button onClick={startGame} disabled={players.length < 2} className="big-btn lime w-full disabled:opacity-50 disabled:cursor-not-allowed">
                Start Game
              </button>
            ) : (
              <div className="text-center py-3 rounded-2xl bg-[var(--cream)] border border-[var(--ink)]/10">
                <p className="font-bold text-[var(--ink)]/70 animate-pulse">Waiting for host…</p>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl bg-rose-100 text-rose-800 px-4 py-3 text-sm font-semibold text-center border border-rose-200">{error}</div>
            )}
          </div>
        </main>
      )}

      {/* GAME */}
      {screen === 'game' && room && (
        <main className="flex-1 flex flex-col p-3 md:p-5 gap-3 overflow-hidden">
          <header className="game-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="title-tiny text-white drop-shadow-sm">Sketch <span className="text-[var(--sunshine)]">&amp;</span> Guess</h2>
              <p className="text-sm font-bold text-white/80">Room {roomCode} • Round {room.current_round}/{room.max_rounds}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`timer-bubble ${timeLeft <= 10 ? 'urgent' : ''}`}>{timeLeft || '--'}s</div>
              <button onClick={leaveRoom} className="text-sm font-black underline decoration-2 underline-offset-2 text-white/80 hover:text-white">Leave</button>
            </div>
          </header>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_19rem] gap-3 min-h-0">
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* STATUS BAR */}
              <div className="rounded-2xl bg-white/90 border-b-4 border-[var(--ink)]/10 p-3 flex items-center justify-between shadow-[0_2px_0_var(--border)]">
                {room.status === 'choosing' && (
                  <p className="font-black text-lg text-[var(--ink)]">
                    {isDrawer ? 'Pick a word to draw:' : `Waiting for ${drawer?.name || 'drawer'} to choose…`}
                  </p>
                )}
                {room.status === 'drawing' && (
                  <p className="font-black text-lg text-[var(--ink)]">
                    {isDrawer ? `Drawing: ${room.word}` : `${drawer?.name || 'Someone'} is drawing`}
                    {!isDrawer && room.word && (
                      <span className="ml-3 text-sm font-black text-[var(--ink)]/50">({room.word.length} letters)</span>
                    )}
                  </p>
                )}
                {room.status === 'round_end' && (
                  <p className="font-black text-lg text-[var(--candy)]">The word was: <span className="uppercase text-[var(--lime)]">{room.word}</span></p>
                )}
                {room.status === 'game_end' && (
                  <p className="font-black text-xl text-[var(--sunshine)]">Game Over! 🏆</p>
                )}
              </div>

              {/* WORD OPTIONS */}
              {room.status === 'choosing' && isDrawer && (
                <div className="flex flex-wrap gap-3">
                  {room.word_options.map((w, i) => (
                    <button
                      key={w}
                      onClick={() => selectWord(w)}
                      className={`word-btn diff-${i === 0 ? 'easy' : i === 1 ? 'medium' : 'hard'}`}
                    >
                      {w}
                      <span className="diff-pill">{i === 0 ? 'easy' : i === 1 ? 'med' : 'hard'}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* CANVAS */}
              <div
                ref={canvasContainerRef}
                className="relative flex-1 min-h-[16rem] rounded-3xl overflow-hidden bg-white border-b-8 border-[var(--ink)]/10 shadow-xl"
              >
                {room.status !== 'drawing' && (
                  <div className="absolute top-3 left-3 z-10 bg-black/70 text-white text-xs font-black px-3 py-1.5 rounded-full">
                    {isDrawer ? 'Your turn to draw!' : `${drawer?.name || 'Someone'} will draw`}
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className={`w-full h-full touch-none ${isDrawer && room.status === 'drawing' ? 'cursor-crosshair' : 'cursor-default'}`}
                  onMouseDown={startStroke}
                  onMouseMove={moveStroke}
                  onMouseUp={endStroke}
                  onMouseLeave={endStroke}
                  onTouchStart={startStroke}
                  onTouchMove={moveStroke}
                  onTouchEnd={endStroke}
                />
                {pulseCorrect && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="big-confetti text-5xl font-black text-[var(--lime)] drop-shadow-xl animate-bounce-soft">🎉 Correct!</div>
                  </div>
                )}
              </div>

              {/* TOOLBAR / GUESS */}
              {isDrawer && room.status === 'drawing' && (
                <div className="rounded-2xl bg-white/90 dark:bg-[var(--dark-card)] border-b-4 border-[var(--ink)]/10 dark:border-[var(--dark-border)] p-3 flex flex-wrap items-center gap-3 shadow-[0_2px_0_var(--border)] transition">
                  <div className="flex items-center gap-1.5 bg-[var(--cream)] dark:bg-[var(--dark-surface)] rounded-full p-1.5 border border-[var(--ink)]/10">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setIsEraser(false); setBrushColor(c); }}
                        className={`w-8 h-8 rounded-full border-2 shadow-sm transition ${brushColor === c && !isEraser ? 'ring-2 ring-[var(--candy)] scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                        aria-label={`color ${c}`}
                      />
                    ))}
                  </div>
                  <div className="h-8 w-px bg-[var(--ink)]/10"></div>
                  <div className="flex items-center gap-1.5 bg-[var(--cream)] dark:bg-[var(--dark-surface)] rounded-full p-1.5 border border-[var(--ink)]/10">
                    {[2, 4, 8, 14].map((s) => (
                      <button
                        key={s}
                        onClick={() => setBrushSize(s)}
                        className={`rounded-full bg-[var(--ink)] dark:bg-white transition ${brushSize === s ? 'ring-2 ring-[var(--candy)] ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
                        style={{ width: s * 1.3 + 8, height: s * 1.3 + 8 }}
                        aria-label={`brush size ${s}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setIsEraser((e) => !e)}
                    className={`eraser-btn ${isEraser ? 'active' : ''}`}
                    title="Eraser"
                    aria-label="eraser"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                    <span className="text-[10px] font-black uppercase tracking-wide">Eraser</span>
                  </button>
                  <div className="flex-1"></div>
                  <span className="text-xs font-black text-[var(--ink)]/40 uppercase tracking-wide hidden sm:inline">draw here</span>
                </div>
              )}

              {!isDrawer && room.status === 'drawing' && (
                <form onSubmit={(e) => { e.preventDefault(); sendGuess(); }} className="flex gap-3">
                  <input
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder="Type your guess…"
                    className="input flex-1"
                    maxLength={40}
                    autoFocus
                  />
                  <button type="submit" className="big-btn lime">Guess</button>
                </form>
              )}

              {guessFeedback && (
                <p className={`text-center font-black text-lg ${pulseCorrect ? 'text-[var(--lime)]' : 'text-[var(--candy)]'}`}>{guessFeedback}</p>
              )}
            </div>

            {/* SIDEBAR */}
            <aside className="flex flex-col gap-3 min-h-0">
              {/* SCOREBOARD */}
              <div className="game-panel p-4 flex flex-col max-h-[50vh]">
                <h3 className="section-title text-[var(--candy)] mb-3">Scoreboard</h3>
                <ul className="space-y-2 overflow-y-auto pr-1">
                  {players.slice().sort((a, b) => b.score - a.score).map((p, i) => (
                    <li key={p.id} className="leader-row">
                      <span className="leader-rank">#{i + 1}</span>
                      {getAvatarShape(p.avatar, pastelForName(p.name))}
                      <div className="min-w-0 flex-1">
                        <p className="font-black truncate text-sm">{p.name} {p.id === myPlayerId && <span className="text-[10px] text-[var(--ink)]/50">(you)</span>}</p>
                        {p.id === drawer?.id && room.status === 'drawing' && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--sky)] text-[var(--ink)]">DRAWING</span>}
                      </div>
                      <span className="font-black text-[var(--candy)] text-lg">{p.score}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* GUESSES */}
              <div className="game-panel p-4 flex-1 min-h-[12rem] flex flex-col overflow-hidden">
                <h3 className="section-title text-[var(--lime)] mb-3">Guesses</h3>
                <div ref={messageBoxRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {messages.map((m) => (
                    <div key={m.id} className={`chat-bubble ${m.is_correct ? 'correct' : ''}`}>
                      <span className="font-black text-xs opacity-70">{m.player?.name || 'Player'}</span>
                      <span className="font-semibold text-sm block">{m.text}</span>
                    </div>
                  ))}
                  {messages.length === 0 && <p className="text-sm opacity-50 italic text-center mt-4">No guesses yet.</p>}
                </div>
              </div>

              {room.status === 'game_end' && isHost && (
                <button onClick={playAgain} className="big-btn primary w-full">Play Again</button>
              )}
              {room.status === 'game_end' && !isHost && (
                <div className="text-center game-panel py-3"><p className="font-bold text-[var(--ink)]/70">Host is choosing…</p></div>
              )}
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
