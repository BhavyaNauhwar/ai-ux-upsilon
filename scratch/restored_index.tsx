import { createFileRoute } from "@tanstack/react-router";
import { useAppearance } from "@/lib/appearance";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  HelpCircle,
  ImageIcon,
  Code2,
  Mail,
  Info,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  FileText,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  SquarePen,
  Sun,
  Trash2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  isSupabaseConfigured,
  loadChatsForUser,
  saveChatsForUser,
  deleteChatFromSupabase,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  supabase,
  uploadAttachmentToSupabase,
  loadMemoriesForUser,
  saveMemory,
  deleteMemory,
  updateMemory,
  getUserPaidStatus,
  setUserPaidStatus,
  type Memory,
} from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/")({
  component: Index,
});

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  streaming?: boolean;
  imageUrl?: string;
  error?: boolean;
  attachments?: Array<{ kind: "image" | "pdf"; name: string; publicUrl?: string; storagePath?: string }>;
};

type Chat = {
  id: string;
  title: string;
  pinned?: boolean;
  updatedAt: number;
  messages: Message[];
};

type ComposerAttachment = { id: string; kind: "image" | "pdf"; file: File; url?: string };

const STORAGE_KEY = "lexmed.chats.v1";

const readStoredChats = (): Chat[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Chat[]) : [];
  } catch {
    return [];
  }
};

const persistChats = (chats: Chat[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
};

const seedChats = (): Chat[] => {
  return [];
};

const GUEST_KEY = "lexmed.guest_session.v1";
const GUEST_MAX_CREDITS = 5;
const GUEST_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours of inactivity

type GuestSessionData = {
  creditsUsed: number;
  lastActive: number;
};

const getGuestSession = (): GuestSessionData => {
  if (typeof window === "undefined") return { creditsUsed: 0, lastActive: Date.now() };
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return { creditsUsed: 0, lastActive: Date.now() };
    const parsed = JSON.parse(raw) as GuestSessionData;
    if (Date.now() - parsed.lastActive > GUEST_EXPIRE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(GUEST_KEY);
      return { creditsUsed: 0, lastActive: Date.now() };
    }
    return parsed;
  } catch {
    return { creditsUsed: 0, lastActive: Date.now() };
  }
};

const saveGuestSession = (session: GuestSessionData) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_KEY, JSON.stringify({ ...session, lastActive: Date.now() }));
};

function Index() {
  const [chats, setChats] = useState<Chat[]>(() => {
    // Only use localStorage for unauthenticated bootstrap — Supabase will override when ready
    return readStoredChats();
  });
  const sessionUserRef = useRef<{ id: string; email: string | null } | null>(null);
  const remoteChatsLoadedRef = useRef<boolean>(false);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [guestCreditsUsed, setGuestCreditsUsed] = useState<number>(() => getGuestSession().creditsUsed);
  const [upgradeOpen, setUpgradeOpen] = useState<boolean>(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Chat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string | null } | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const stored = readStoredChats();
      setChats(stored);
      setIsPaid(false);
      remoteChatsLoadedRef.current = false;
      setSupabaseReady(true);
      return;
    }

    let active = true;

    const restoreSession = async () => {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (!active) return;
      const userObj = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      sessionUserRef.current = userObj;
      setSessionUser(userObj);

      if (session?.user) {
        const remoteChats = await loadChatsForUser(session.user.id);
        const paidStatus = await getUserPaidStatus(session.user.id);
        if (active) {
          setChats(remoteChats);
          setIsPaid(paidStatus);
          remoteChatsLoadedRef.current = true;
          setSupabaseReady(true);
        }
      } else {
        const stored = readStoredChats();
        if (active) {
          setChats(stored);
          setIsPaid(false);
          remoteChatsLoadedRef.current = false;
          setSupabaseReady(true);
        }
      }
    };

    void restoreSession();

    const { data: authListener } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      const hadUser = sessionUserRef.current;
      const newUser = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      sessionUserRef.current = newUser;
      setSessionUser(newUser);
      if (session?.user) {
        const remoteChats = await loadChatsForUser(session.user.id);
        const paidStatus = await getUserPaidStatus(session.user.id);
        if (active) {
          setChats(remoteChats);
          setIsPaid(paidStatus);
          remoteChatsLoadedRef.current = true;
        }
      } else if (hadUser) {
        remoteChatsLoadedRef.current = false;
        setIsPaid(false);
        setSessionUser(null);
        const stored = readStoredChats();
        if (active) setChats(stored);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Persist to localStorage always
    persistChats(chats);
    // ONLY sync to Supabase after initial remote chats load completed
    if (supabaseReady && sessionUser?.id && remoteChatsLoadedRef.current) {
      void saveChatsForUser(chats, sessionUser.id);
    }
  }, [chats, sessionUser?.id, supabaseReady]);

  // Load memories when user signs in
  useEffect(() => {
    if (!sessionUser?.id) { setMemories([]); return; }
    loadMemoriesForUser(sessionUser.id).then(setMemories).catch(console.error);
  }, [sessionUser?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distance > 240);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeChatId, messages.length]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const newChat = () => {
    setActiveChatId(null);
    setInput("");
    setMobileOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAssistantReply = (chatId: string, msgId: string, patch: Partial<Message>) => {
    setChats((cs) =>
      cs.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === msgId ? { ...m, ...patch, streaming: false } : m,
              ),
            }
          : c,
      ),
    );
  };

  const streamReply = (chatId: string, msgId: string, full: string) => {
    setIsStreaming(true);
    const tokens = full.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i += Math.max(1, Math.round(Math.random() * 3));
      const partial = tokens.slice(0, i).join("");
      setChats((cs) =>
        cs.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, content: partial, streaming: i < tokens.length } : m,
                ),
              }
            : c,
        ),
      );
      if (i < tokens.length) {
        setTimeout(tick, 22);
      } else {
        setIsStreaming(false);
      }
    };
    setTimeout(tick, 220);
  };

  const requestAssistantReply = async (chatId: string, msgId: string, contextMessages: Array<{ role: string; content: string }>) => {
    setIsStreaming(true);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: contextMessages }),
      });

      const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;

      if (!response.ok) {
        const message = payload?.error ?? "We couldn't complete that request. Please try again.";
        console.error("Gemini request failed", { status: response.status, payload });
        updateAssistantReply(chatId, msgId, {
          content: message,
          error: true,
        });
        return;
      }

      const content = payload?.text?.trim() || "I couldn't generate a response right now.";
      streamReply(chatId, msgId, content);
    } catch (error) {
      console.error("Gemini request failed", error);
      updateAssistantReply(chatId, msgId, {
        content: "We couldn't complete that request. Please try again.",
        error: true,
      });
    } finally {
      if (!isStreaming) {
        setIsStreaming(false);
      }
    }
  };

  const send = async (attachments: ComposerAttachment[] = []) => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Enforce Access Control
    if (!isPaid) {
      if (!sessionUser) {
        // Guest user credit check
        const sess = getGuestSession();
        if (sess.creditsUsed >= GUEST_MAX_CREDITS) {
          toast.error("Guest credit limit reached. Please upgrade to Full Access to continue!");
          setUpgradeOpen(true);
          return;
        }
        const newCredits = sess.creditsUsed + 1;
        setGuestCreditsUsed(newCredits);
        saveGuestSession({ creditsUsed: newCredits, lastActive: Date.now() });
      } else {
        // Authenticated but not paid
        toast.error("Please complete the test payment to unlock Full Access!");
        setUpgradeOpen(true);
        return;
      }
    }

    const now = Date.now();

    // Resolve chatId upfront so attachments can use it even for new chats
    let chatId = activeChatId ?? crypto.randomUUID();
    const isNewChat = !activeChatId;

    // Build history BEFORE state mutation (avoids stale state)
    const existingMessages = isNewChat ? [] : (chats.find(c => c.id === chatId)?.messages ?? []);

    // Upload attachments now that chatId is guaranteed
    const uploadedAttachments: Message["attachments"] = [];
    if (attachments.length > 0 && sessionUser?.id && isPaid) {
      for (const attachment of attachments) {
        try {
          const stored = await uploadAttachmentToSupabase(sessionUser.id, chatId, attachment.file, attachment.kind);
          uploadedAttachments.push({
            kind: attachment.kind,
            name: attachment.file.name,
            publicUrl: stored.publicUrl ?? undefined,
            storagePath: stored.path,
          });
        } catch (error) {
          console.error("Attachment upload failed", error);
          toast.error(`Upload failed for ${attachment.file.name}`);
        }
      }
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: now,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: now + 1,
      streaming: true,
    };

    if (isNewChat) {
      const title = text.length > 40 ? text.slice(0, 40).trim() + "…" : text;
      const chat: Chat = { id: chatId, title, updatedAt: now, messages: [userMsg, assistantMsg] };
      setChats((cs) => [chat, ...cs]);
      setActiveChatId(chatId);
    } else {
      setChats((cs) =>
        cs.map((c) =>
          c.id === chatId
            ? { ...c, updatedAt: now, messages: [...c.messages, userMsg, assistantMsg] }
            : c,
        ),
      );
    }

    setInput("");

    // Build context from local snapshot (not stale React state)
    const contextMessages: Array<{ role: string; content: string }> = [];

    // System prompt for feature limits & identity
    if (!isPaid) {
      contextMessages.push({
        role: "system",
        content: `You are LexMed AI running in Guest/Test Mode. Note: File creation, PDF generation, image processing, and persistent cloud sync are restricted to Full Access. If the user asks for these features, kindly inform them that they are available in Full Access.`,
      });
    }

    // Prepend memories as a system message for authenticated users
    if (sessionUser?.id && memories.length > 0) {
      const memoryText = memories.map(m => `- ${m.content}`).join("\n");
      contextMessages.push({
        role: "system",
        content: `You have access to the following long-term memory about this user. Use it for context when relevant:\n${memoryText}`,
      });
    }

    // Add existing conversation history
    for (const m of existingMessages) {
      if (m.content && (m.role === "user" || m.role === "assistant")) {
        contextMessages.push({ role: m.role, content: m.content });
      }
    }

    // Add the new user message
    contextMessages.push({ role: "user", content: text });

    // Auto-detect & save memories
    if (sessionUser?.id) {
      const memoryMatch = text.match(/(?:please\s+)?remember\s+(?:that\s+)?(.+)/i);
      const nameMatch = text.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const preferenceMatch = text.match(/(?:i prefer|my preference is)\s+(.+)/i);
      const jobMatch = text.match(/(?:i work as|i am a|i'm a)\s+(.+)/i);

      let contentToSave: string | null = null;
      if (memoryMatch?.[1]) contentToSave = memoryMatch[1].trim();
      else if (nameMatch?.[1]) contentToSave = `User's name: ${nameMatch[1].trim()}`;
      else if (preferenceMatch?.[1]) contentToSave = `User prefers: ${preferenceMatch[1].trim()}`;
      else if (jobMatch?.[1]) contentToSave = `User's role: ${jobMatch[1].trim()}`;

      if (contentToSave) {
        const exists = memories.some(m => m.content.toLowerCase() === contentToSave!.toLowerCase());
        if (!exists) {
          void handleSaveMemory(contentToSave);
        }
      }
    }

    await requestAssistantReply(chatId, assistantId, contextMessages);
  };

  const regenerate = async (msgId: string) => {
    if (!activeChatId || isStreaming) return;
    setChats((cs) =>
      cs.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === msgId ? { ...m, content: "", streaming: true } : m,
              ),
            }
          : c,
      ),
    );
    const chat = chats.find((c) => c.id === activeChatId);
    const msgIdx = chat?.messages.findIndex(m => m.id === msgId) ?? -1;
    if (msgIdx === -1 || !chat) return;

    const contextMessages: Array<{ role: string; content: string }> = [];
    if (sessionUser?.id && memories.length > 0) {
      const memoryText = memories.map(m => `- ${m.content}`).join("\n");
      contextMessages.push({
        role: "system",
        content: `You have access to the following long-term memory about this user. Use it for context when relevant:\n${memoryText}`,
      });
    }
    const history = chat.messages.slice(0, msgIdx);
    for (const m of history) {
      if (m.content && (m.role === "user" || m.role === "assistant")) {
        contextMessages.push({ role: m.role, content: m.content });
      }
    }

    if (contextMessages.some(m => m.role === "user")) {
      await requestAssistantReply(activeChatId, msgId, contextMessages);
    }
  };

  const editUserMessage = async (msg: Message, next: string) => {
    if (!activeChatId || isStreaming) return;
    const text = next.trim();
    if (!text) return;
    const assistantId = crypto.randomUUID();
    // Capture history BEFORE state mutation
    const chat = chats.find(c => c.id === activeChatId);
    const msgIdx = chat?.messages.findIndex(m => m.id === msg.id) ?? -1;
    const priorHistory = msgIdx !== -1 && chat ? chat.messages.slice(0, msgIdx) : [];

    setChats((cs) =>
      cs.map((c) => {
        if (c.id !== activeChatId) return c;
        const idx = c.messages.findIndex((m) => m.id === msg.id);
        if (idx === -1) return c;
        const kept = c.messages.slice(0, idx);
        return {
          ...c,
          messages: [
            ...kept,
            { ...msg, content: text },
            { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), streaming: true },
          ],
        };
      }),
    );

    const contextMessages: Array<{ role: string; content: string }> = [];
    if (sessionUser?.id && memories.length > 0) {
      const memoryText = memories.map(m => `- ${m.content}`).join("\n");
      contextMessages.push({
        role: "system",
        content: `You have access to the following long-term memory about this user. Use it for context when relevant:\n${memoryText}`,
      });
    }
    for (const m of priorHistory) {
      if (m.content && (m.role === "user" || m.role === "assistant")) {
        contextMessages.push({ role: m.role, content: m.content });
      }
    }
    contextMessages.push({ role: "user", content: text });

    await requestAssistantReply(activeChatId, assistantId, contextMessages);
  };

  const togglePin = (id: string) =>
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  const renameChat = (id: string, title: string) =>
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  const deleteChat = (id: string) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
    // also remove from Supabase
    if (sessionUser?.id) void deleteChatFromSupabase(id);
  };

  const handleAuthSubmit = async (mode: "signin" | "signup") => {
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthError("Enter an email and password to continue.");
      return;
    }
    if (mode === "signup" && password !== authConfirmPassword.trim()) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to enable Supabase auth.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);

    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        toast.success("Signed in");
      } else {
        await signUpWithEmail(email, password);
        toast.success("Account created — check your email to confirm.");
      }
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setSessionUser(null);
      setChats([]);
      setActiveChatId(null);
      setAuthPassword("");
      setAuthConfirmPassword("");
      toast.success("Signed out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out");
    }
  };

  // Memory helpers
  const handleSaveMemory = async (content: string, category?: string) => {
    if (!sessionUser?.id) return;
    const mem = await saveMemory(sessionUser.id, content, category);
    if (mem) setMemories((prev) => [mem, ...prev]);
  };

  const handleDeleteMemory = async (id: string) => {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdateMemory = async (id: string, content: string) => {
    const updated = await updateMemory(id, content);
    if (updated) setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
  };

  return (
    <div
      className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground"
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragActive(false);
          toast.success("File received (frontend demo)");
        }
      }}
    >
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden bg-muted transition-[width] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] md:block",
          sidebarOpen ? "w-[272px]" : "w-0",
        )}
      >
        <div className="h-full w-[272px]">
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelect={setActiveChatId}
            onNewChat={newChat}
            onCollapse={() => setSidebarOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
            onTogglePin={togglePin}
            onRename={(c) => setRenameTarget(c)}
            onDelete={(c) => setDeleteTarget(c)}
            sessionUser={sessionUser}
            onSignOut={handleSignOut}
            onOpenAuth={() => { setAuthMode("signin"); setAuthOpen(true); }}
            isPaid={isPaid}
            guestCreditsUsed={guestCreditsUsed}
            onOpenUpgrade={() => setUpgradeOpen(true)}
          />
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[300px] border-r-0 bg-muted p-0 [&>button.absolute]:hidden">
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelect={(id) => {
              setActiveChatId(id);
              setMobileOpen(false);
            }}
            onNewChat={newChat}
            onCollapse={() => setMobileOpen(false)}
            onOpenSettings={() => {
              setMobileOpen(false);
              setSettingsOpen(true);
            }}
            onTogglePin={togglePin}
            onRename={(c) => setRenameTarget(c)}
            onDelete={(c) => setDeleteTarget(c)}
            sessionUser={sessionUser}
            onSignOut={handleSignOut}
            onOpenAuth={() => { setAuthMode("signin"); setAuthOpen(true); }}
            isPaid={isPaid}
            guestCreditsUsed={guestCreditsUsed}
            onOpenUpgrade={() => { setMobileOpen(false); setUpgradeOpen(true); }}
            mobile
          />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-3 md:px-4">
          {!sidebarOpen && (
            <IconButton
              onClick={() => setSidebarOpen(true)}
              label="Open sidebar"
              className="hidden md:grid"
            >
              <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          )}
          <IconButton onClick={() => setMobileOpen(true)} label="Open menu" className="md:hidden">
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
          <div className="ml-1 truncate text-[14px] font-medium text-foreground/70">
            {activeChat?.title ?? "New chat"}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {!isPaid && (
              <Button
                size="sm"
                onClick={() => setUpgradeOpen(true)}
                className="h-8 gap-1.5 px-3 text-[12.5px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 fill-current" />
                Get Full Access
              </Button>
            )}
            <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <h1 className="text-center text-[30px] font-semibold tracking-tight text-foreground md:text-[34px]">
                How can I assist you today?
              </h1>
              <p className="mt-2 text-center text-[14px] text-foreground/50">
                Ask about medical protocols, case law, or drafting.
              </p>
              <div className="mt-10">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={(attachments) => {
                    void send(attachments);
                  }}
                  inputRef={inputRef}
                  disabled={isStreaming}
                  isPaid={isPaid}
                  onRequireUpgrade={() => setUpgradeOpen(true)}
                />
                <SuggestionRow
                  onPick={(s) => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-10">
                {messages.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    isLast={i === messages.length - 1}
                    onRegenerate={() => regenerate(m.id)}
                    onEdit={(next) => editUserMessage(m, next)}
                    onOpenImage={(url) => setLightboxUrl(url)}
                    disabled={isStreaming}
                  />
                ))}
              </div>
            </div>
            {showScrollBtn && (
              <button
                onClick={scrollToBottom}
                aria-label="Scroll to latest"
                className="pointer-events-auto absolute bottom-[120px] left-1/2 z-10 -translate-x-1/2 rounded-full border border-foreground/10 bg-background px-2 py-2 text-foreground/70 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.18)] transition-all hover:text-foreground animate-fade-in"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
            <div className="shrink-0 bg-background">
              <div className="mx-auto max-w-3xl px-4 pb-4 pt-2 md:px-8 md:pb-5">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={(attachments) => {
                    void send(attachments);
                  }}
                  inputRef={inputRef}
                  disabled={isStreaming}
                  isPaid={isPaid}
                  onRequireUpgrade={() => setUpgradeOpen(true)}
                />
                <p className="mt-2.5 text-center text-[11px] text-foreground/45">
                  LexMed AI can make mistakes. Verify critical information.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        sessionUser={sessionUser}
        memories={memories}
        onSaveMemory={handleSaveMemory}
        onDeleteMemory={handleDeleteMemory}
        onUpdateMemory={handleUpdateMemory}
      />

      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {dragActive && <DragDropOverlay />}

      <RenameDialog
        chat={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={(id, title) => {
          renameChat(id, title);
          setRenameTarget(null);
          toast.success("Chat renamed");
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">"{deleteTarget?.title}"</span>. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteChat(deleteTarget.id);
                setDeleteTarget(null);
                toast.success("Chat deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auth Dialog */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{authMode === "signin" ? "Sign in" : "Create account"}</DialogTitle>
            <DialogDescription>
              {authMode === "signin"
                ? "Sign in to sync your chats across devices."
                : "Create a free account to save your chats."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              autoComplete="email"
              disabled={authBusy}
            />
            <Input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              disabled={authBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && authMode === "signin") void handleAuthSubmit(authMode);
              }}
            />
            {authMode === "signup" && (
              <Input
                type="password"
                placeholder="Confirm password"
                value={authConfirmPassword}
                onChange={(e) => setAuthConfirmPassword(e.target.value)}
                disabled={authBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAuthSubmit(authMode);
                }}
              />
            )}
            {authError && (
              <p className="text-[13px] text-destructive">{authError}</p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="text-[13px] text-foreground/60"
              onClick={() => {
                if (!sessionUser && authMode === "signin") {
                  setAuthOpen(false);
                  setUpgradeOpen(true);
                } else {
                  setAuthMode(authMode === "signin" ? "signup" : "signin");
                  setAuthError(null);
                }
              }}
              disabled={authBusy}
            >
              {authMode === "signin" ? "Create account" : "Sign in instead"}
            </Button>
            <Button
              onClick={() => void handleAuthSubmit(authMode)}
              disabled={authBusy}
            >
              {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade / Test Payment Dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-emerald-500 fill-emerald-500" />
              Unlock LexMed AI Full Access
            </DialogTitle>
            <DialogDescription>
              Get unlimited access to medical & legal AI capabilities.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-[13.5px]">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span><strong>Unlimited AI conversations</strong></span>
              </div>
              <div className="flex items-center gap-2.5 text-[13.5px]">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span><strong>File, Image & PDF attachments</strong> support</span>
              </div>
              <div className="flex items-center gap-2.5 text-[13.5px]">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span><strong>Long-term AI memory</strong> across sessions</span>
              </div>
              <div className="flex items-center gap-2.5 text-[13.5px]">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span><strong>Persistent cloud sync</strong> backed by Supabase</span>
              </div>
            </div>

            {!sessionUser ? (
              <div className="space-y-3 rounded-xl border border-foreground/10 p-4">
                <div className="text-[13px] font-medium text-foreground/80">Step 1: Sign in or Create an Account</div>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  disabled={authBusy}
                />
                {authError && <p className="text-[12.5px] text-destructive">{authError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1"
                    onClick={() => void handleAuthSubmit("signin")}
                    disabled={authBusy}
                  >
                    {authBusy ? "Please wait…" : "Sign In"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void handleAuthSubmit("signup")}
                    disabled={authBusy}
                  >
                    Create Account
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-foreground/10 p-4 bg-amber-500/5 border-amber-500/20">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-foreground">Step 2: Test Payment Simulation</div>
                  <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Development Mode</span>
                </div>
                <p className="text-[12.5px] text-foreground/60">
                  Account: <strong>{sessionUser.email}</strong>. Click below to simulate a successful payment and unlock Full Access.
                </p>
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium gap-2"
                  onClick={async () => {
                    if (!sessionUser?.id) return;
                    setAuthBusy(true);
                    const ok = await setUserPaidStatus(sessionUser.id, true);
                    setAuthBusy(false);
                    if (ok) {
                      setIsPaid(true);
                      setUpgradeOpen(false);
                      toast.success("Test Payment Successful! Full Access unlocked.");
                    } else {
                      toast.error("Unable to update payment status.");
                    }
                  }}
                  disabled={authBusy}
                >
                  <CreditCard className="h-4 w-4" />
                  {authBusy ? "Processing..." : "Complete Test Payment ($0.00)"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  // Minimal monochrome 4-point spark mark. Inherits currentColor,
  // so it renders black in light mode and white in dark mode.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 1.5c.28 3.5 1.2 6.02 2.76 7.58 1.56 1.56 4.08 2.48 7.58 2.76v.32c-3.5.28-6.02 1.2-7.58 2.76-1.56 1.56-2.48 4.08-2.76 7.58h-.32c-.28-3.5-1.2-6.02-2.76-7.58-1.56-1.56-4.08-2.48-7.58-2.76v-.32c3.5-.28 6.02-1.2 7.58-2.76C10.48 7.52 11.4 5 11.68 1.5H12z" />
    </svg>
  );
}

function Sidebar({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
  onCollapse,
  onOpenSettings,
  onTogglePin,
  onRename,
  onDelete,
  mobile,
  sessionUser,
  onSignOut,
  onOpenAuth,
  isPaid,
  guestCreditsUsed,
  onOpenUpgrade,
}: {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onTogglePin: (id: string) => void;
  onRename: (c: Chat) => void;
  onDelete: (c: Chat) => void;
  mobile?: boolean;
  sessionUser: { id: string; email: string | null } | null;
  onSignOut: () => void;
  onOpenAuth: () => void;
  isPaid?: boolean;
  guestCreditsUsed?: number;
  onOpenUpgrade?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
    const pinned = list.filter((c) => c.pinned);
    const rest = list.filter((c) => !c.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    return { pinned, rest };
  }, [chats, query]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <BrandMark className="h-[18px] w-[18px] text-foreground" />
          <span className="text-[14px] font-semibold tracking-tight">LexMed AI</span>
        </div>
        <IconButton onClick={onCollapse} label={mobile ? "Close menu" : "Collapse sidebar"}>
          {mobile ? <X className="h-4 w-4" strokeWidth={1.75} /> : <PanelLeft className="h-4 w-4" strokeWidth={1.75} />}
        </IconButton>
      </div>

      <div className="px-3">
        <button
          onClick={onNewChat}
          className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] font-medium text-foreground/85 transition-colors hover:surface-hover"
        >
          <SquarePen className="h-[16px] w-[16px]" strokeWidth={1.75} />
          New chat
          <kbd className="ml-auto rounded border border-foreground/10 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
            ⌘⇧O
          </kbd>
        </button>
        <div className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] text-foreground/70 transition-colors focus-within:surface-hover hover:surface-hover">
          <Search className="h-[15px] w-[15px]" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent placeholder:text-foreground/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="scroll-thin mt-4 flex-1 overflow-y-auto px-2">
        {filtered.pinned.length > 0 && (
          <SidebarSection label="Pinned">
            {filtered.pinned.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={activeChatId === c.id}
                onSelect={() => onSelect(c.id)}
                onTogglePin={() => onTogglePin(c.id)}
                onRename={() => onRename(c)}
                onDelete={() => onDelete(c)}
              />
            ))}
          </SidebarSection>
        )}
        <SidebarSection label="Recent">
          {filtered.rest.length === 0 && filtered.pinned.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-foreground/40">No chats found</div>
          ) : (
            filtered.rest.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={activeChatId === c.id}
                onSelect={() => onSelect(c.id)}
                onTogglePin={() => onTogglePin(c.id)}
                onRename={() => onRename(c)}
                onDelete={() => onDelete(c)}
              />
            ))
          )}
        </SidebarSection>
      </div>

      <div className="px-2 pb-3 pt-2 space-y-2">
        {!isPaid && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-foreground">
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Sparkles className="h-3.5 w-3.5 fill-current" /> {!sessionUser ? "Guest Mode" : "Free Plan"}
              </span>
              {!sessionUser && (
                <span className="text-[11px] font-medium text-foreground/60">
                  {Math.max(0, GUEST_MAX_CREDITS - (guestCreditsUsed ?? 0))}/{GUEST_MAX_CREDITS} left
                </span>
              )}
            </div>
            <button
              onClick={onOpenUpgrade}
              className="mt-2 w-full rounded-lg bg-amber-500 hover:bg-amber-600 py-1.5 text-center text-[12px] font-semibold text-white transition-colors"
            >
              Get Full Access
            </button>
          </div>
        )}
        <AccountMenu
          onOpenSettings={onOpenSettings}
          sessionUser={sessionUser}
          onSignOut={onSignOut}
          onOpenAuth={onOpenAuth}
          isPaid={isPaid}
          onOpenUpgrade={onOpenUpgrade}
        />
      </div>
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/40">
        {label}
      </div>
      <ul className="space-y-[1px]">{children}</ul>
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li className="group/row relative">
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-[7px] text-left text-[14px] transition-colors",
          active
            ? "surface-active text-foreground"
            : "text-foreground/75 hover:surface-hover hover:text-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        {chat.pinned && (
          <Pin
            className={cn(
              "h-3 w-3 shrink-0 text-foreground/40 group-hover/row:hidden",
              (menuOpen || active) && "hidden",
            )}
            strokeWidth={2}
          />
        )}
      </button>
      <div
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 transition-opacity",
          menuOpen || active ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
        )}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Chat actions"
              onClick={(e) => e.stopPropagation()}
              className="grid h-6 w-6 place-items-center rounded-md text-foreground/60 hover:surface-hover hover:text-foreground"
            >
              <MoreHorizontal className="h-[15px] w-[15px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onTogglePin}>
              {chat.pinned ? (
                <><PinOff className="mr-2 h-4 w-4" /> Unpin</>
              ) : (
                <><Pin className="mr-2 h-4 w-4" /> Pin</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function AccountMenu({
  onOpenSettings,
  sessionUser,
  onSignOut,
  onOpenAuth,
  isPaid,
  onOpenUpgrade,
}: {
  onOpenSettings: () => void;
  sessionUser: { id: string; email: string | null } | null;
  onSignOut: () => void;
  onOpenAuth: () => void;
  isPaid?: boolean;
  onOpenUpgrade?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = sessionUser?.email?.split("@")[0] ?? "Guest";
  const initials = displayName.slice(0, 2).toUpperCase();

  if (!sessionUser) {
    return (
      <button
        onClick={onOpenAuth}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] font-medium text-foreground/75 transition-colors hover:surface-hover hover:text-foreground"
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/10 text-foreground/60">
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        </div>
        Sign in to sync chats
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
            open ? "surface-active" : "hover:surface-hover",
          )}
        >
          <Avatar initials={initials} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{displayName}</div>
            <div className="truncate text-[11.5px] text-foreground/50">{sessionUser.email ?? ""}</div>
          </div>
          <ChevronRight className={cn("h-4 w-4 text-foreground/40 transition-transform", open && "rotate-90")} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-[288px] p-0">
        <div className="flex items-start gap-3 p-4">
          <Avatar initials={initials} large />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{displayName}</div>
            <div className="truncate text-[12.5px] text-foreground/55">{sessionUser.email ?? ""}</div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/75">
              <Sparkles className="h-3 w-3 text-amber-500 fill-amber-500" strokeWidth={2} />
              {isPaid ? "Full Access (Pro)" : "Free Plan"}
            </div>
            >
              {a.kind === "image" && a.url ? (
                <img
                  src={a.url}
                  alt={a.file.name}
                  className="h-10 w-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground/70">
                  <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
              )}
              <div className="min-w-0 pr-1">
                <div className="max-w-[220px] truncate text-[13px] font-medium text-foreground">
                  {a.file.name}
                </div>
                <div className="text-[11.5px] uppercase tracking-wide text-foreground/50">
                  {a.kind === "image" ? "Image" : "PDF"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.file.name}`}
                className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-foreground/55 transition-colors hover:surface-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn(
          "relative flex items-end rounded-[26px] border bg-background px-2 py-2 transition-all duration-200",
          focused
            ? "border-foreground/25 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_-14px_rgba(0,0,0,0.14)]"
            : "border-foreground/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
        )}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, "image");
            e.target.value = "";
          }}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, "pdf");
            e.target.value = "";
          }}
        />

        <Popover open={uploadOpen} onOpenChange={setUploadOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Attach file"
              className="mr-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors hover:surface-hover hover:text-foreground"
            >
              <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" sideOffset={8} className="w-[200px] p-1.5">
            <button
              type="button"
              onClick={() => { setUploadOpen(false); imageInputRef.current?.click(); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-foreground/85 transition-colors hover:surface-hover hover:text-foreground"
            >
              <ImageIcon className="h-4 w-4 text-foreground/60" strokeWidth={1.75} />
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => { setUploadOpen(false); pdfInputRef.current?.click(); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-foreground/85 transition-colors hover:surface-hover hover:text-foreground"
            >
              <FileText className="h-4 w-4 text-foreground/60" strokeWidth={1.75} />
              Upload PDF
            </button>
          </PopoverContent>
        </Popover>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          placeholder="Message LexMed AI…"
          aria-label="Message LexMed AI"
          className="block flex-1 resize-none bg-transparent px-3 py-2.5 text-[15.5px] leading-[1.55] text-foreground placeholder:text-foreground/40 focus:outline-none"
          style={{ minHeight: 28, maxHeight: 220 }}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!hasText || disabled}
          className={cn(
            "ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-200",
            hasText && !disabled
              ? "bg-foreground text-background hover:opacity-90 active:scale-95"
              : "bg-foreground/10 text-foreground/40",
          )}
        >
          <ArrowUp className="h-[18px] w-[18px] -translate-y-px" strokeWidth={2.25} />
        </button>
      </form>
    </div>
  );
}


function SuggestionRow({ onPick }: { onPick: (s: string) => void }) {
  const items = [
    { icon: ImageIcon, label: "Draw an image of a futuristic city" },
    { icon: FileText, label: "Summarize this PDF" },
  };
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-foreground/10 bg-[#0b0d12] text-[#e6e8ee] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">{lang ?? "code"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-3.5 font-mono text-[13px] leading-[1.6]">
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />
      </pre>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCode(code: string, lang?: string) {
  const escaped = escapeHtml(code);
  const keywords =
    /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|super|static|public|private|protected|interface|type|enum|as|void|def|self|None|True|False|print|elif|lambda|pass|yield|with|package|struct|impl|fn|let|mut|match|use|pub)\b/g;
  return escaped
    .replace(/(&quot;|&#39;|`)((?:\\.|(?!\1).)*?)\1/g, '<span style="color:#a5d6a7">$1$2$1</span>')
    .replace(/\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, '<span style="color:#f2b78b">$1</span>')
    .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span style="color:#6b7385;font-style:italic">$1</span>')
    .replace(keywords, '<span style="color:#c792ea">$1</span>')
    .replace(/([A-Za-z_$][\w$]*)(?=\s*\()/g, '<span style="color:#82aaff">$1</span>');
}

function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg text-foreground/60 transition-colors hover:surface-hover hover:text-foreground",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

function RenameDialog({
  chat,
  onClose,
  onSave,
}: {
  chat: Chat | null;
  onClose: () => void;
  onSave: (id: string, title: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => { if (chat) setValue(chat.title); }, [chat]);
  return (
    <Dialog open={!!chat} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this conversation a clearer name.</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && chat) onSave(chat.id, value.trim() || chat.title); }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => chat && onSave(chat.id, value.trim() || chat.title)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: Sliders },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof SETTINGS_TABS)[number]["id"];

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<TabId>("general");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your LexMed AI preferences.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
          <aside className="scroll-thin hidden max-h-[86vh] overflow-y-auto border-r border-foreground/10 bg-muted/60 p-2 md:block">
            <div className="px-3 pb-2 pt-3 text-[13px] font-semibold">Settings</div>
            <nav className="space-y-[1px]">
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                    tab === t.id
                      ? "surface-active text-foreground"
                      : "text-foreground/75 hover:surface-hover hover:text-foreground",
                  )}
                >
                  <t.icon className="h-[15px] w-[15px] text-foreground/60" strokeWidth={1.75} />
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>
          <div className="scroll-thin max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
              <div>
                <div className="text-[15px] font-semibold">{SETTINGS_TABS.find((t) => t.id === tab)?.label}</div>
                <div className="text-[12.5px] text-foreground/55">Configure how LexMed AI works for you.</div>
              </div>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as TabId)}
                className="rounded-md border border-foreground/15 bg-background px-2 py-1 text-[13px] md:hidden"
              >
                {SETTINGS_TABS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
              </select>
            </div>
            <div className="space-y-6 p-6">
              <SettingsPanel tab={tab} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel({ tab }: { tab: TabId }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-foreground/10 bg-[#0b0d12] text-[#e6e8ee] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">{lang ?? "code"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-3.5 font-mono text-[13px] leading-[1.6]">
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />
      </pre>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCode(code: string, lang?: string) {
  const escaped = escapeHtml(code);
  const keywords =
    /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|super|static|public|private|protected|interface|type|enum|as|void|def|self|None|True|False|print|elif|lambda|pass|yield|with|package|struct|impl|fn|let|mut|match|use|pub)\b/g;
  return escaped
    .replace(/(&quot;|&#39;|`)((?:\\.|(?!\1).)*?)\1/g, '<span style="color:#a5d6a7">$1$2$1</span>')
    .replace(/\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, '<span style="color:#f2b78b">$1</span>')
    .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span style="color:#6b7385;font-style:italic">$1</span>')
    .replace(keywords, '<span style="color:#c792ea">$1</span>')
    .replace(/([A-Za-z_$][\w$]*)(?=\s*\()/g, '<span style="color:#82aaff">$1</span>');
}

function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg text-foreground/60 transition-colors hover:surface-hover hover:text-foreground",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

function RenameDialog({
  chat,
  onClose,
  onSave,
}: {
  chat: Chat | null;
  onClose: () => void;
  onSave: (id: string, title: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => { if (chat) setValue(chat.title); }, [chat]);
  return (
    <Dialog open={!!chat} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this conversation a clearer name.</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && chat) onSave(chat.id, value.trim() || chat.title); }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => chat && onSave(chat.id, value.trim() || chat.title)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: Sliders },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof SETTINGS_TABS)[number]["id"];

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<TabId>("general");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your LexMed AI preferences.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
          <aside className="scroll-thin hidden max-h-[86vh] overflow-y-auto border-r border-foreground/10 bg-muted/60 p-2 md:block">
            <div className="px-3 pb-2 pt-3 text-[13px] font-semibold">Settings</div>
            <nav className="space-y-[1px]">
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                    tab === t.id
                      ? "surface-active text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

function RenameDialog({
  chat,
  onClose,
  onSave,
}: {
  chat: Chat | null;
  onClose: () => void;
  onSave: (id: string, title: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => { if (chat) setValue(chat.title); }, [chat]);
  return (
    <Dialog open={!!chat} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this conversation a clearer name.</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && chat) onSave(chat.id, value.trim() || chat.title); }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => chat && onSave(chat.id, value.trim() || chat.title)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: Sliders },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "memory", label: "Memory", icon: ShieldCheck },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof SETTINGS_TABS)[number]["id"];

function SettingsDialog({
  open,
  onOpenChange,
  sessionUser,
  memories,
  onSaveMemory,
  onDeleteMemory,
  onUpdateMemory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionUser: { id: string; email: string | null } | null;
  memories: Memory[];
  onSaveMemory: (content: string, category?: string) => void;
  onDeleteMemory: (id: string) => void;
  onUpdateMemory: (id: string, content: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("general");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your LexMed AI preferences.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
          <aside className="scroll-thin hidden max-h-[86vh] overflow-y-auto border-r border-foreground/10 bg-muted/60 p-2 md:block">
            <div className="px-3 pb-2 pt-3 text-[13px] font-semibold">Settings</div>
            <nav className="space-y-[1px]">
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                    tab === t.id
                      ? "surface-active text-foreground"
                      : "text-foreground/75 hover:surface-hover hover:text-foreground",
                  )}
                >
                  <t.icon className="h-[15px] w-[15px] text-foreground/60" strokeWidth={1.75} />
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>
          <div className="scroll-thin max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
              <div>
                <div className="text-[15px] font-semibold">{SETTINGS_TABS.find((t) => t.id === tab)?.label}</div>
                <div className="text-[12.5px] text-foreground/55">Configure how LexMed AI works for you.</div>
              </div>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as TabId)}
                className="rounded-md border border-foreground/15 bg-background px-2 py-1 text-[13px] md:hidden"
              >
                {SETTINGS_TABS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
              </select>
            </div>
            <div className="space-y-6 p-6">
              <SettingsPanel
                tab={tab}
                sessionUser={sessionUser}
                memories={memories}
                onSaveMemory={onSaveMemory}
                onDeleteMemory={onDeleteMemory}
                onUpdateMemory={onUpdateMemory}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel({
  tab,
  sessionUser,
  memories,
  onSaveMemory,
  onDeleteMemory,
  onUpdateMemory,
}: {
  tab: TabId;
  sessionUser: { id: string; email: string | null } | null;
  memories: Memory[];
  onSaveMemory: (content: string, category?: string) => void;
  onDeleteMemory: (id: string) => void;
  onUpdateMemory: (id: string, content: string) => void;
}) {
  const [newMemory, setNewMemory] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState("");

  switch (tab) {
    case "general":
      return (
        <SettingsGroup title="Profile">
          <SettingRow label="Email" description="Your Supabase account email.">
            <Input value={sessionUser?.email ?? "Not signed in"} readOnly disabled className="max-w-xs" />
          </SettingRow>
          <SettingRow label="User ID" description="Your unique identifier.">
            <Input value={sessionUser?.id ?? "—"} readOnly disabled className="max-w-xs font-mono text-[12px]" />
          </SettingRow>
          <SettingRow label="Language" description="Interface language.">
            <span className="text-[13.5px] text-foreground/70">English</span>
          </SettingRow>
        </SettingsGroup>
      );
    case "appearance":
      return (
        <SettingsGroup title="Appearance">
          <SettingRow label="Theme" description="Pick how LexMed AI looks."><ThemePicker /></SettingRow>
          <SettingRow label="Compact mode" description="Denser spacing throughout the app."><CompactToggle /></SettingRow>
          <SettingRow label="Reduced motion" description="Disable non-essential animations."><ReducedMotionToggle /></SettingRow>
        </SettingsGroup>
      );
    case "memory":
      return (
        <div className="space-y-4">
          <SettingsGroup title="Long-term Memory">
            <div className="p-4">
              <p className="mb-3 text-[13px] text-foreground/60">
                Memories are injected into the AI context to provide continuity across conversations. Say &quot;remember that…&quot; to create one.
              </p>
              {!sessionUser && (
                <p className="text-[13px] text-foreground/50 italic">Sign in to use memory.</p>
              )}
              {sessionUser && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newMemory}
                      onChange={(e) => setNewMemory(e.target.value)}
                      placeholder="Add a memory…"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newMemory.trim()) {
                          onSaveMemory(newMemory.trim());
                          setNewMemory("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => { if (newMemory.trim()) { onSaveMemory(newMemory.trim()); setNewMemory(""); } }}
                      disabled={!newMemory.trim()}
                    >
                      Add
                    </Button>
                  </div>
                  {memories.length === 0 && (
                    <p className="text-[13px] text-foreground/40 text-center py-4">No memories yet.</p>
                  )}
                  <div className="space-y-2">
                    {memories.map((mem) => (
                      <div key={mem.id} className="flex items-start gap-2 rounded-lg border border-foreground/10 bg-background p-3">
                        {editingMemoryId === mem.id ? (
                          <div className="flex flex-1 flex-col gap-2">
                            <Input
                              value={editingMemoryContent}
                              onChange={(e) => setEditingMemoryContent(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { onUpdateMemory(mem.id, editingMemoryContent); setEditingMemoryId(null); }
                                if (e.key === "Escape") setEditingMemoryId(null);
                              }}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => { onUpdateMemory(mem.id, editingMemoryContent); setEditingMemoryId(null); }}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingMemoryId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <span className="flex-1 text-[13.5px] text-foreground/80">{mem.content}</span>
                        )}
                        {editingMemoryId !== mem.id && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditingMemoryId(mem.id); setEditingMemoryContent(mem.content); }}
                              className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:surface-hover hover:text-foreground"
                              aria-label="Edit memory"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={() => onDeleteMemory(mem.id)}
                              className="grid h-7 w-7 place-items-center rounded-md text-destructive/60 hover:surface-hover hover:text-destructive"
                              aria-label="Delete memory"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>