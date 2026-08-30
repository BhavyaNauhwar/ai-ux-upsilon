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
  AlertCircle,
  ArrowDown,
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
  X,
  ZoomIn,
  ZoomOut,
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

const STORAGE_KEY = "upsilon.chats.v1";

const readStoredChats = (): Chat[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem("lexmed.chats.v1");
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

const GUEST_KEY = "upsilon.guest_session.v1";
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

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
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
  // Keep a ref so send() always reads the latest memories without stale closures
  const memoriesRef = useRef<Memory[]>([]);

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
          if (remoteChats !== null) {
            setChats(remoteChats);
            remoteChatsLoadedRef.current = true;
          }
          setIsPaid(paidStatus);
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

    const { data: authListener } = supabase!.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      const currentUserId = sessionUserRef.current?.id;
      const newUserId = session?.user?.id;

      // Prevent auth state re-fetch resets on window focus/token refreshes when user hasn't changed
      if (currentUserId && currentUserId === newUserId && (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        return;
      }

      const newUser = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      sessionUserRef.current = newUser;
      setSessionUser(newUser);
      if (session?.user) {
        if (currentUserId !== newUserId || !remoteChatsLoadedRef.current) {
          const remoteChats = await loadChatsForUser(session.user.id);
          const paidStatus = await getUserPaidStatus(session.user.id);
          if (active) {
            if (remoteChats !== null) {
              setChats(remoteChats);
              remoteChatsLoadedRef.current = true;
            }
            setIsPaid(paidStatus);
          }
        }
      } else if (currentUserId) {
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
    if (!sessionUser?.id) {
      setMemories([]);
      memoriesRef.current = [];
      return;
    }
    loadMemoriesForUser(sessionUser.id).then((mems) => {
      setMemories(mems);
      memoriesRef.current = mems;
    }).catch(console.error);
  }, [sessionUser?.id]);

  // Keep memoriesRef in sync whenever memories state changes
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

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

  const requestAssistantReply = async (
    chatId: string,
    msgId: string,
    contextMessages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; data: string; name?: string }> }>
  ) => {
    setIsStreaming(true);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: contextMessages }),
      });

      const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;

      if (!response.ok) {
        const errMsg = payload?.error ?? "We couldn't complete that request. Please try again.";
        console.error("AI request failed", { status: response.status, payload });
        updateAssistantReply(chatId, msgId, {
          content: errMsg,
          error: true,
        });
        // Always clear streaming state on error
        setIsStreaming(false);
        return;
      }

      const content = payload?.text?.trim() || "I couldn't generate a response right now.";
      // streamReply manages isStreaming internally — it sets false when animation finishes
      streamReply(chatId, msgId, content);
    } catch (error) {
      console.error("AI request failed", error);
      updateAssistantReply(chatId, msgId, {
        content: "We couldn't complete that request. Please try again.",
        error: true,
      });
      // Always clear streaming state on error
      setIsStreaming(false);
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

    // Process attachments for the user message
    const userMessageAttachments: Message["attachments"] = [];
    if (attachments.length > 0) {
      for (const attachment of attachments) {
        let publicUrl: string | undefined = undefined;
        let storagePath: string | undefined = undefined;

        if (sessionUser?.id && isPaid) {
          try {
            const stored = await uploadAttachmentToSupabase(sessionUser.id, chatId, attachment.file, attachment.kind);
            if (stored?.publicUrl) publicUrl = stored.publicUrl;
            if (stored?.path) storagePath = stored.path;
          } catch (error) {
            console.warn("Supabase storage upload failed, falling back to local data URL", error);
            toast.error("File upload failed — using local preview only.");
          }
        }

        // If no Supabase URL, store as base64 data URL for images (so it persists in localStorage)
        // Blob URLs (URL.createObjectURL) are revoked after send and would break the preview
        if (!publicUrl && attachment.kind === "image") {
          try {
            const base64 = await fileToBase64(attachment.file);
            publicUrl = `data:${attachment.file.type || "image/jpeg"};base64,${base64}`;
          } catch (err) {
            console.warn("Could not read image as data URL", err);
          }
        }

        userMessageAttachments.push({
          kind: attachment.kind,
          name: attachment.file.name,
          publicUrl: publicUrl ?? undefined,
          storagePath,
        });
      }
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: now,
      attachments: userMessageAttachments.length > 0 ? userMessageAttachments : undefined,
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
        content: `You are Upsilon AI, a free AI assistant for research, medical, legal, and general productivity. You are NOT Meta AI, Llama, Groq, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. If asked who made you or what model you are, say you are Upsilon AI. Keep responses helpful and concise. Note: persistent file attachments, PDF analysis, and cloud sync require a Full Access subscription. Image generation is not currently available — respond with text descriptions instead. This is Guest/Test Mode.`,
      });
    } else {
      // Paid/authenticated users get Gemini with full text+vision capabilities
      contextMessages.push({
        role: "system",
        content: `You are Upsilon AI, an advanced AI assistant specializing in research, document analysis, knowledge work, and general productivity. You are NOT Gemini, Claude, ChatGPT, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. If asked who you are or what model you use, say you are Upsilon AI. You can understand and analyze images and PDF documents that users attach. Image generation (creating new images) is not currently available — if asked to generate or draw an image, politely explain this capability is coming soon and offer to describe or discuss the topic instead. Be helpful, accurate, and concise.`,
      });
    }

    // Read latest memories from ref (avoids stale closure)
    const currentMemories = memoriesRef.current;

    // Prepend memories as a system message for authenticated users
    if (sessionUser?.id && currentMemories.length > 0) {
      const memoryText = currentMemories.map(m => `- ${m.content}`).join("\n");
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

    // Prepare inline base64 attachments for multimodal AI parsing
    const inlineAttachments: Array<{ mimeType: string; data: string; name: string }> = [];
    if (attachments.length > 0) {
      for (const att of attachments) {
        if (att.file) {
          try {
            const base64Data = await fileToBase64(att.file);
            inlineAttachments.push({
              mimeType: att.file.type || (att.kind === "pdf" ? "application/pdf" : "image/jpeg"),
              data: base64Data,
              name: att.file.name,
            });
          } catch (err) {
            console.error("Failed to convert attachment base64", err);
          }
        }
      }
    }

    // Add the new user message
    contextMessages.push({
      role: "user",
      content: text,
      attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
    });

    // Client-side regex memory extraction (broad patterns)
    if (sessionUser?.id) {
      // Expanded regex patterns to capture more natural language
      const rememberMatch = text.match(/(?:please\s+)?(?:remember|keep in mind|note that|don't forget)\s+(?:that\s+)?(.+)/i);
      const nameMatch1 = text.match(/(?:my name is|call me|i am|i'm|i go by)\s+([A-Za-z][a-zA-Z'-]+(\s+[A-Za-z][a-zA-Z'-]+)?)/i);
      const preferenceMatch = text.match(/(?:i prefer|i like|i love|i enjoy|i hate|i dislike|my favorite is|my preference is)\s+(.+?)(?:[.!?]|$)/i);
      const goalMatch = text.match(/(?:my goal is|my target is|i want to|i'm trying to|i'm working on)\s+(.+?)(?:[.!?]|$)/i);
      const jobMatch = text.match(/(?:i work as|i am a|i'm a|my job is|my profession is|i work in|i'm in)\s+([a-zA-Z][^.!?]{2,50})(?:[.!?]|$)/i);
      const locationMatch = text.match(/(?:i live in|i'm from|i'm based in|my location is|i'm in)\s+([A-Za-z][^.!?]{2,40})(?:[.!?]|$)/i);

      const candidateMemories: string[] = [];

      if (rememberMatch?.[1]) {
        // If the "remember" phrase also encodes a name (e.g. "remember I'm Dyna"),
        // prefer the normalised form to avoid saving both the raw phrase AND the
        // structured name that extractAndSave will also produce.
        const innerNameMatch = rememberMatch[1].match(/(?:i am|i'm|my name is|call me)\s+([A-Za-z][a-zA-Z'-]+(\s+[A-Za-z][a-zA-Z'-]+)?)/i);
        if (innerNameMatch?.[1]) {
          candidateMemories.push(`User's name is ${innerNameMatch[1].trim()}`);
        } else {
          candidateMemories.push(rememberMatch[1].trim().replace(/[.!?]$/, ""));
        }
      }
      if (nameMatch1?.[1] && !rememberMatch) {
        candidateMemories.push(`User's name is ${nameMatch1[1].trim()}`);
      }
      if (preferenceMatch?.[1] && !rememberMatch) {
        candidateMemories.push(`User prefers: ${preferenceMatch[1].trim()}`);
      }
      if (goalMatch?.[1] && !rememberMatch) {
        candidateMemories.push(`User's goal: ${goalMatch[1].trim()}`);
      }
      if (jobMatch?.[1] && !rememberMatch) {
        candidateMemories.push(`User's role: ${jobMatch[1].trim()}`);
      }
      if (locationMatch?.[1] && !rememberMatch) {
        candidateMemories.push(`User is based in: ${locationMatch[1].trim()}`);
      }

      for (const mem of candidateMemories) {
        const exists = memoriesRef.current.some(m => m.content.toLowerCase() === mem.toLowerCase());
        if (!exists) {
          void handleSaveMemory(mem);
        }
      }

      // AI-assisted extraction: after main response, ask AI to extract any persistent facts
      // We do this as a fire-and-forget background task
      void extractAndSaveMemoriesFromMessage(text, sessionUser.id);
    }

    await requestAssistantReply(chatId, assistantId, contextMessages);

    // AI chat title generation — only for brand-new chats, fires once after the reply
    if (isNewChat) {
      void generateChatTitle(chatId, text);
    }
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
    if (!isPaid) {
      contextMessages.push({
        role: "system",
        content: `You are Upsilon AI, a free AI assistant for research, medical, legal, and general productivity. You are NOT Meta AI, Llama, Groq, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. Image generation is not available. This is Guest/Test Mode.`,
      });
    } else {
      contextMessages.push({
        role: "system",
        content: `You are Upsilon AI, an advanced AI assistant specializing in research, document analysis, knowledge work, and general productivity. You are NOT Gemini, Claude, ChatGPT, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. You can understand and analyze images and PDFs. Image generation is not currently available.`,
      });
    }
    const freshMemories = memoriesRef.current;
    if (sessionUser?.id && freshMemories.length > 0) {
      const memoryText = freshMemories.map(m => `- ${m.content}`).join("\n");
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
    if (!isPaid) {
      contextMessages.push({
        role: "system",
        content: `You are Upsilon AI, a free AI assistant for research, medical, legal, and general productivity. You are NOT Meta AI, Llama, Groq, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. Image generation is not available. This is Guest/Test Mode.`,
      });
    } else {
      contextMessages.push({
        role: "system",
        content: `You are Upsilon AI, an advanced AI assistant specializing in research, document analysis, knowledge work, and general productivity. You are NOT Gemini, Claude, ChatGPT, or any other branded AI — you are Upsilon AI. Do not reveal the underlying technical provider. You can understand and analyze images and PDFs. Image generation is not currently available.`,
      });
    }
    const freshMemoriesEdit = memoriesRef.current;
    if (sessionUser?.id && freshMemoriesEdit.length > 0) {
      const memoryText = freshMemoriesEdit.map(m => `- ${m.content}`).join("\n");
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
    if (mode === "signup" && authOpen && password !== authConfirmPassword.trim()) {
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
        toast.success("Account created - check your email to confirm.");
      }
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthOpen(false);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "";
      if (errMsg.includes("Failed to fetch")) {
        setAuthError("Could not connect to the authentication server. Please check your internet connection or try again later.");
        console.error("Supabase network error (Project might be paused):", error);
      } else {
        setAuthError(errMsg || "Authentication failed");
        console.error("Auth error:", error);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // CRITICAL: Reset remoteChatsLoadedRef BEFORE setChats([]) to prevent the
      // chats useEffect from treating the empty array as a valid sync state
      // and wiping all chats from Supabase.
      remoteChatsLoadedRef.current = false;
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
    // Dedup check against ref (always fresh)
    const trimmed = content.trim();
    if (!trimmed) return;
    const exists = memoriesRef.current.some(m => m.content.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const mem = await saveMemory(sessionUser.id, trimmed, category);
    if (mem) {
      setMemories((prev) => [mem, ...prev]);
      memoriesRef.current = [mem, ...memoriesRef.current];
    }
  };

  const handleDeleteMemory = async (id: string) => {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
    memoriesRef.current = memoriesRef.current.filter((m) => m.id !== id);
  };

  const handleUpdateMemory = async (id: string, content: string) => {
    const updated = await updateMemory(id, content);
    if (updated) {
      setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
      memoriesRef.current = memoriesRef.current.map((m) => (m.id === id ? updated : m));
    }
  };

  // AI-assisted background memory extraction for paid users
  // Calls the /api/gemini endpoint with a focused extraction prompt
  const extractAndSaveMemoriesFromMessage = async (userMessage: string, userId: string) => {
    // Only run for messages that might contain personal facts
    const mightContainFact = /\b(name|call|i am|i'm|i work|i live|i prefer|i like|i love|i hate|my goal|remember|note|location|age|country|city|job|profession|hobby|favorite|prefer)\b/i.test(userMessage);
    if (!mightContainFact) return;

    try {
      const extractionMessages = [
        {
          role: "system",
          content: `You are a memory extraction assistant. Extract ONLY concrete, persistent personal facts from the user message below that are worth saving long-term (name, preferences, goals, location, job, etc.). Respond with a JSON array of strings, each being one concise memory in the format "User's X is Y" or "User prefers Y" etc. If there are no facts worth saving, respond with []. Do NOT include temporary or trivial information. Do NOT include more than 3 memories.`,
        },
        {
          role: "user",
          content: `Extract memories from: "${userMessage}"`,
        },
      ];

      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: extractionMessages }),
      });

      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as { text?: string } | null;
      const rawText = payload?.text?.trim() ?? "";

      // Parse the JSON array from the AI response
      const jsonMatch = rawText.match(/\[([\s\S]*?)\]/);
      if (!jsonMatch) return;

      let extracted: string[] = [];
      try {
        extracted = JSON.parse(`[${jsonMatch[1]}]`);
      } catch {
        // Try to parse the full match
        try { extracted = JSON.parse(jsonMatch[0]); } catch { return; }
      }

      if (!Array.isArray(extracted)) return;

      for (const mem of extracted) {
        if (typeof mem === "string" && mem.trim()) {
          const trimmedMem = mem.trim();
          // Exact match check
          const exactExists = memoriesRef.current.some(
            m => m.content.toLowerCase() === trimmedMem.toLowerCase()
          );
          if (exactExists) continue;

          // Semantic dedup: extract the core subject value from structured memories
          // e.g. "User's name is Dyna" and "I'm Dyna" both resolve to the key "dyna"
          const coreValue = (s: string) =>
            s.toLowerCase()
              .replace(/^user[''`]?s?\s+\w+\s+is\s+/i, "")
              .replace(/^i[''`]?m\s+/i, "")
              .replace(/^i am\s+/i, "")
              .replace(/^my name is\s+/i, "")
              .replace(/^call me\s+/i, "")
              .replace(/[^a-z0-9]/g, "")
              .trim();

          const semanticExists = memoriesRef.current.some(
            m => coreValue(m.content) === coreValue(trimmedMem) && coreValue(trimmedMem).length > 1
          );
          if (semanticExists) continue;

          const saved = await saveMemory(userId, trimmedMem);
          if (saved) {
            setMemories((prev) => {
              const updated = [saved, ...prev.filter(m => m.id !== saved.id)];
              memoriesRef.current = updated;
              return updated;
            });
          }
        }
      }
    } catch (err) {
      console.warn("Memory extraction failed silently", err);
    }
  };

  // Generate a concise AI-driven title for a chat after its first message.
  // Fires once per new chat as a fire-and-forget background task.
  const generateChatTitle = async (chatId: string, userMessage: string) => {
    try {
      const titleMessages = [
        {
          role: "system",
          content: "You are a chat title generator. Given a user's first message, respond with ONLY a short, readable title of 3-5 words that captures the topic. No punctuation at the end. No quotes. No extra words.",
        },
        {
          role: "user",
          content: userMessage,
        },
      ];

      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: titleMessages }),
      });

      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as { text?: string } | null;
      const rawTitle = payload?.text?.trim();
      if (!rawTitle) return;

      // Sanitize: take only the first line, strip quotes and trailing punctuation
      const title = rawTitle
        .split("\n")[0]
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/[.!?]+$/, "")
        .trim();

      if (!title || title.length < 2 || title.length > 80) return;

      // Update the chat title in state and persist it
      setChats((cs) => {
        const updated = cs.map((c) =>
          c.id === chatId ? { ...c, title } : c
        );
        persistChats(updated);
        return updated;
      });
    } catch (err) {
      console.warn("Chat title generation failed silently", err);
    }
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
                Ask anything, create something, or explore an idea.
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
                  Upsilon AI can make mistakes. Verify critical information.
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

      {/* Upgrade / Billing Dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-emerald-500 fill-emerald-500" />
              Unlock Upsilon AI Full Access
            </DialogTitle>
            <DialogDescription>
              Get unlimited access to advanced AI capabilities.
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
                  disabled={authBusy}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  disabled={authBusy}
                />
                {authError && <p className="text-[12.5px] text-destructive">{authError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
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
              <div className="space-y-3 rounded-xl border border-foreground/10 p-4 bg-emerald-500/5 border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-foreground">Step 2: Test Payment Simulation</div>
                  <span className="text-[11px] font-medium text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded-full">Development Mode</span>
                </div>
                <p className="text-[12.5px] text-foreground/60">
                  Account: <strong>{sessionUser.email}</strong>. Click below to simulate a successful payment and unlock Full Access.
                </p>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-sm"
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
  // Minimalist monochrome Upsilon (Υ) logo mark
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l8 9 8-9" />
      <path d="M12 13v7" />
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
          <span className="text-[14px] font-semibold tracking-tight">Upsilon AI</span>
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
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-foreground">
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5 fill-current" /> {!sessionUser ? "Guest Mode" : "Free Plan"}
              </span>
            </div>
            <button
              onClick={onOpenUpgrade}
              className="mt-2 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 py-1.5 text-center text-[12px] font-semibold text-white transition-colors shadow-sm"
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
        onClick={onOpenUpgrade}
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
              <Sparkles className="h-3 w-3 text-emerald-500 fill-emerald-500" strokeWidth={2} />
              {isPaid ? "Full Access (Pro)" : "Free Plan"}
            </div>
          </div>
        </div>
        <Separator />
        <div className="p-1.5">
          {!isPaid && (
            <AccountItem
              icon={Sparkles}
              label="Upgrade to Full Access"
              accent
              onSelect={() => { setOpen(false); onOpenUpgrade?.(); }}
            />
          )}
          <AccountItem icon={Sun} label="Appearance" onSelect={() => { setOpen(false); onOpenSettings(); }} />
          <AccountItem icon={Settings2} label="Settings" onSelect={() => { setOpen(false); onOpenSettings(); }} />
          <AccountItem icon={HelpCircle} label="Help & support" />
        </div>
        <Separator />
        <div className="p-1.5">
          <AccountItem icon={LogOut} label="Sign out" onSelect={() => { setOpen(false); onSignOut(); }} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountItem({
  icon: Icon,
  label,
  trailing,
  accent,
  onSelect,
}: {
  icon: typeof Sparkles;
  label: string;
  trailing?: ReactNode;
  accent?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:surface-hover",
        accent ? "text-foreground" : "text-foreground/80",
      )}
    >
      <Icon className={cn("h-[15px] w-[15px]", accent ? "text-foreground" : "text-foreground/60")} strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function Avatar({ initials, large }: { initials?: string; large?: boolean }) {
  const letters = initials ?? "??";
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-foreground font-semibold text-background",
        large ? "h-11 w-11 text-[14px]" : "h-8 w-8 text-[12px]",
      )}
    >
      {letters}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/60">
      {children}
    </kbd>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  inputRef,
  disabled,
  isPaid,
  onRequireUpgrade,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (attachments: Array<{ id: string; kind: "image" | "pdf"; file: File; url?: string }>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  isPaid?: boolean;
  onRequireUpgrade?: () => void;
}) {
  const [focused, setFocused] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${next}px`;
  }, [value, inputRef]);

  type Attachment = { id: string; kind: "image" | "pdf"; file: File; url?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.url) URL.revokeObjectURL(a.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = (files: FileList | null, kind: "image" | "pdf") => {
    if (!files || files.length === 0) return;
    const next: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      file,
      url: kind === "image" ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  };

  const clearAttachments = () => {
    attachments.forEach((a) => {
      if (a.url) URL.revokeObjectURL(a.url);
    });
    setAttachments([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled) {
        onSubmit(attachments);
        clearAttachments();
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled) {
      onSubmit(attachments);
      clearAttachments();
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2.5 rounded-xl border border-foreground/10 bg-background px-2.5 py-2 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
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

        <Popover open={uploadOpen} onOpenChange={(open) => {
          if (open && !isPaid) {
            toast.error("File & PDF attachments require Full Access. Upgrade to unlock!");
            onRequireUpgrade?.();
            return;
          }
          setUploadOpen(open);
        }}>
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
          placeholder="Message Upsilon AI…"
          aria-label="Message Upsilon AI"
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
    { icon: Code2, label: "Write a Python script" },
    { icon: Mail, label: "Help me write an email" },
  ];
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.label}
            onClick={() => onPick(it.label)}
            className="flex items-center gap-2.5 rounded-xl border border-foreground/10 bg-background px-3.5 py-3 text-left text-[13.5px] text-foreground/75 transition-colors hover:surface-hover hover:text-foreground"
          >
            <Icon className="h-4 w-4 shrink-0 text-foreground/60" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MessageRow({
  message,
  isLast,
  onRegenerate,
  onEdit,
  onOpenImage,
  disabled,
}: {
  message: Message;
  isLast: boolean;
  onRegenerate: () => void;
  onEdit: (next: string) => void;
  onOpenImage: (url: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (message.role === "user") {
    return (
      <div className="lm-msg-in group/msg mb-6 flex flex-col items-end">
        {editing ? (
          <div className="w-full max-w-[85%] rounded-2xl border border-foreground/15 bg-background p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[80px] w-full resize-none bg-transparent p-2 text-[15px] leading-[1.55] focus:outline-none"
            />
            <div className="flex justify-end gap-2 p-1">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(message.content); setEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => { onEdit(draft); setEditing(false); }}>Send</Button>
            </div>
          </div>
        ) : (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-[1.55] text-foreground">
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-2.5 space-y-2">
                {message.attachments.map((att, idx) => (
                  <div key={idx} className="group/att relative flex items-center gap-2.5 rounded-xl border border-foreground/10 bg-background/80 p-2 text-left">
                    {att.kind === "image" ? (
                      att.publicUrl ? (
                        <div
                          className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-foreground/5"
                          onClick={() => onOpenImage(att.publicUrl!)}
                        >
                          <img src={att.publicUrl} alt={att.name} className="h-full w-full object-cover transition-transform hover:scale-105" />
                        </div>
                      ) : (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground/70">
                          <ImageIcon className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                      )
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground/70">
                        <FileText className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">{att.name}</div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/50">{att.kind}</div>
                    </div>
                    {att.publicUrl && (
                      <div className="flex items-center gap-1">
                        {att.kind === "image" && (
                          <button
                            type="button"
                            onClick={() => onOpenImage(att.publicUrl!)}
                            className="grid h-7 w-7 place-items-center rounded-md text-foreground/60 transition-colors hover:surface-hover hover:text-foreground"
                            aria-label="View image"
                          >
                            <ZoomIn className="h-4 w-4" />
                          </button>
                        )}
                        <a
                          href={att.publicUrl}
                          download={att.name}
                          target="_blank"
                          rel="noreferrer"
                          className="grid h-7 w-7 place-items-center rounded-md text-foreground/60 transition-colors hover:surface-hover hover:text-foreground"
                          aria-label="Download attachment"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {message.content}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1 pr-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <MsgAction label="Edit" onClick={() => setEditing(true)} disabled={disabled}>
            <Pencil className="h-[13px] w-[13px]" strokeWidth={1.75} />
          </MsgAction>
          <MsgAction label={copied ? "Copied" : "Copy"} onClick={copy}>
            {copied ? <Check className="h-[13px] w-[13px]" strokeWidth={2} /> : <Copy className="h-[13px] w-[13px]" strokeWidth={1.75} />}
          </MsgAction>
          <span className="ml-1 text-[11px] text-foreground/40">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lm-msg-in group/msg mb-8">
      <div className="text-[15.5px] leading-[1.75] text-foreground">
        {message.error ? (
          <ErrorCard message={message.content} onRetry={onRegenerate} />
        ) : message.streaming && message.content.length === 0 && !message.imageUrl ? (
          <TypingIndicator />
        ) : (
          <>
            {message.content && (
              <FormattedText text={message.content} streaming={message.streaming} />
            )}
            {message.imageUrl && (
              <ImageAttachment url={message.imageUrl} onOpen={() => onOpenImage(message.imageUrl!)} />
            )}
          </>
        )}
      </div>
      {!message.streaming && !message.error && (
        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <MsgAction label={copied ? "Copied" : "Copy"} onClick={copy}>
            {copied ? <Check className="h-[13px] w-[13px]" strokeWidth={2} /> : <Copy className="h-[13px] w-[13px]" strokeWidth={1.75} />}
          </MsgAction>
          {isLast && (
            <MsgAction label="Regenerate" onClick={onRegenerate} disabled={disabled}>
              <RefreshCw className="h-[13px] w-[13px]" strokeWidth={1.75} />
            </MsgAction>
          )}
          {copied && <span className="ml-1 animate-fade-in text-[11px] text-foreground/60">✓ Copied</span>}
          <span className="ml-1 text-[11px] text-foreground/40">{time}</span>
        </div>
      )}
    </div>
  );
}

function MsgAction({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          disabled={disabled}
          className="grid h-7 w-7 place-items-center rounded-md text-foreground/55 transition-colors hover:surface-hover hover:text-foreground disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Assistant is typing">
      <span className="lm-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "0ms" }} />
      <span className="lm-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "180ms" }} />
      <span className="lm-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "360ms" }} />
    </div>
  );
}


function FormattedText({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div>
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1;
        if (b.type === "code") return <CodeBlock key={i} code={b.content} lang={b.lang} />;
        if (b.type === "heading") {
          const sizes = ["text-[22px]", "text-[19px]", "text-[17px]"];
          const cls = sizes[Math.min(b.level - 1, 2)];
          return (
            <div key={i} className={cn("mb-2 mt-5 font-semibold tracking-tight text-foreground first:mt-0", cls)}>
              {renderInline(b.content)}
            </div>
          );
        }
        if (b.type === "hr") return <hr key={i} className="my-5 border-foreground/10" />;
        if (b.type === "quote") {
          return (
            <blockquote key={i} className="my-3 border-l-2 border-foreground/20 pl-3 text-foreground/70">
              {renderInline(b.content)}
            </blockquote>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="my-3 list-decimal space-y-1.5 pl-6 marker:text-foreground/40">
              {b.items.map((l, j) => (<li key={j}>{renderInline(l)}</li>))}
            </ol>
          );
        }
        if (b.type === "table") {
          return (
            <div key={i} className="my-4 overflow-x-auto rounded-xl border border-foreground/10">
              <table className="w-full border-collapse text-[14px]">
                <thead className="bg-foreground/[0.03]">
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j} className="border-b border-foreground/10 px-3 py-2 text-left font-semibold">{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j} className="odd:bg-foreground/[0.015]">
                      {row.map((cell, k) => (
                        <td key={k} className="border-t border-foreground/5 px-3 py-2 align-top text-foreground/85">{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="my-3 list-disc space-y-1.5 pl-6 marker:text-foreground/40">
              {b.items.map((l, j) => (<li key={j}>{renderInline(l)}</li>))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-3 first:mt-0 last:mb-0">
            {renderInline(b.content)}
            {streaming && isLast && <span className="lm-caret" />}
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { type: "p"; content: string }
  | { type: "list"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "heading"; level: number; content: string }
  | { type: "quote"; content: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; content: string; lang?: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (!part) continue;
    const code = part.match(/^```(\w+)?\n?([\s\S]*?)```$/);
    if (code) {
      blocks.push({ type: "code", lang: code[1], content: code[2] });
      continue;
    }
    const chunks = part.split(/\n\n+/);
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      
      const lines = trimmed.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          blocks.push({ type: "heading", level: headingMatch[1].length, content: headingMatch[2] });
          i++;
          continue;
        }
        
        const restLines: string[] = [];
        while (i < lines.length && !lines[i].match(/^(#{1,6})\s+(.*)$/)) {
          restLines.push(lines[i]);
          i++;
        }
        
        if (restLines.length > 0) {
          const restText = restLines.join("\n").trim();
          if (!restText) continue;
          
          if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(restText)) {
            blocks.push({ type: "hr" });
          } else if (restLines.every((l) => /^\s*>\s?/.test(l))) {
            blocks.push({ type: "quote", content: restLines.map((l) => l.replace(/^\s*>\s?/, "")).join(" ") });
          } else if (
            restLines.length >= 2 &&
            restLines[0].includes("|") &&
            /^\s*\|?\s*:?-{2,}/.test(restLines[1])
          ) {
            const splitRow = (l: string) =>
              l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
            const header = splitRow(restLines[0]);
            const rows = restLines.slice(2).map(splitRow);
            blocks.push({ type: "table", header, rows });
          } else if (restLines.every((l) => /^\s*\d+\.\s+/.test(l))) {
            blocks.push({ type: "ol", items: restLines.map((l) => l.replace(/^\s*\d+\.\s+/, "")) });
          } else if (restLines.every((l) => /^\s*[-*]\s+/.test(l))) {
            blocks.push({ type: "list", items: restLines.map((l) => l.replace(/^\s*[-*]\s+/, "")) });
          } else {
            blocks.push({ type: "p", content: restText });
          }
        }
      }
    }
  }
  return blocks;
}

function renderInline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("**") && p.endsWith("**")) {
      return (<strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>);
    }
    if ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_"))) {
      return (<em key={i} className="italic">{p.slice(1, -1)}</em>);
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded-md border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[13px]">
          {p.slice(1, -1)}
        </code>
      );
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground">
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
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

function highlightCode(code: string, lang?: string): string {
  // Single-pass tokenizer: we walk the source string once, emitting tokens.
  // This prevents later regex passes from matching inside already-injected
  // <span style="color:rgb(...)"> attributes, which was the root cause of
  // corrupted output like fetch('https:rgb(...)'>107,...').

  const KEYWORDS = new Set([
    "const","let","var","function","return","if","else","for","while","do",
    "switch","case","break","continue","new","class","extends","import",
    "export","from","default","async","await","try","catch","finally","throw",
    "typeof","instanceof","in","of","null","undefined","true","false","this",
    "super","static","public","private","protected","interface","type","enum",
    "as","void","def","self","None","True","False","print","elif","lambda",
    "pass","yield","with","package","struct","impl","fn","mut","match","use","pub",
  ]);

  // Colors (rgb only — no '#' hex colors, which would break inside HTML attributes)
  const C_COMMENT  = "rgb(107,115,133)";
  const C_STRING   = "rgb(165,214,167)";
  const C_NUMBER   = "rgb(242,183,139)";
  const C_KEYWORD  = "rgb(199,146,234)";
  const C_FUNCTION = "rgb(130,170,255)";

  function esc(s: string) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function span(color: string, content: string) {
    return `<span style="color:${color}">${content}</span>`;
  }

  let i = 0;
  let out = "";

  while (i < code.length) {
    const ch = code[i];

    // ── Single-line comment: // ... \n  or  # ... \n  (Python/shell)
    if ((ch === "/" && code[i+1] === "/") || (ch === "#" && lang !== "html" && lang !== "css")) {
      let j = i;
      while (j < code.length && code[j] !== "\n") j++;
      out += span(C_COMMENT, esc(code.slice(i, j)));
      i = j;
      continue;
    }

    // ── Block comment: /* ... */
    if (ch === "/" && code[i+1] === "*") {
      let j = i + 2;
      while (j < code.length - 1 && !(code[j] === "*" && code[j+1] === "/")) j++;
      j += 2; // consume */
      out += span(C_COMMENT, esc(code.slice(i, j)));
      i = j;
      continue;
    }

    // ── String literals: ", ', `
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\" && j + 1 < code.length) { j += 2; continue; }
        if (code[j] === quote) { j++; break; }
        j++;
      }
      out += span(C_STRING, esc(code.slice(i, j)));
      i = j;
      continue;
    }

    // ── Number literals: 0x..., decimals
    if ((ch >= "0" && ch <= "9") || (ch === "." && code[i+1] >= "0" && code[i+1] <= "9")) {
      // Make sure it's a word boundary (not part of an identifier)
      const prev = i > 0 ? code[i-1] : " ";
      const isWordChar = (c: string) => /[\w$]/.test(c);
      if (!isWordChar(prev)) {
        let j = i;
        if (code[j] === "0" && (code[j+1] === "x" || code[j+1] === "X")) {
          j += 2;
          while (j < code.length && /[\da-fA-F]/.test(code[j])) j++;
        } else {
          while (j < code.length && (code[j] >= "0" && code[j] <= "9")) j++;
          if (j < code.length && code[j] === ".") {
            j++;
            while (j < code.length && (code[j] >= "0" && code[j] <= "9")) j++;
          }
        }
        // Only emit as a number if next char is not a word char
        const next = j < code.length ? code[j] : " ";
        if (!isWordChar(next)) {
          out += span(C_NUMBER, esc(code.slice(i, j)));
          i = j;
          continue;
        }
      }
    }

    // ── Identifier: keyword, function call, or plain identifier
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      // Peek past whitespace to check for '('
      let k = j;
      while (k < code.length && code[k] === " ") k++;
      if (KEYWORDS.has(word)) {
        out += span(C_KEYWORD, esc(word));
      } else if (code[k] === "(") {
        out += span(C_FUNCTION, esc(word));
      } else {
        out += esc(word);
      }
      i = j;
      continue;
    }

    // ── Everything else: emit escaped
    out += esc(ch);
    i++;
  }

  return out;
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
          <DialogDescription>Manage your Upsilon AI preferences.</DialogDescription>
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
                <div className="text-[12.5px] text-foreground/55">Configure how Upsilon AI works for you.</div>
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
          <SettingRow label="Theme" description="Pick how Upsilon AI looks."><ThemePicker /></SettingRow>
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
                Memories are saved automatically by the AI when you share key preferences, goals, or identity details to provide continuity across conversations.
              </p>
              {!sessionUser && (
                <p className="text-[13px] text-foreground/50 italic">Sign in to use memory.</p>
              )}
              {sessionUser && (
                <div className="space-y-3">
                  {memories.length === 0 && (
                    <p className="text-[13px] text-foreground/40 text-center py-4">No memories saved yet.</p>
                  )}
                  <div className="space-y-2">
                    {memories.map((mem) => (
                      <div key={mem.id} className="flex items-start gap-2 rounded-lg border border-foreground/10 bg-background p-3">
                        <span className="flex-1 text-[13.5px] text-foreground/80">{mem.content}</span>
                        <button
                          onClick={() => onDeleteMemory(mem.id)}
                          className="grid h-7 w-7 place-items-center rounded-md text-destructive/60 hover:surface-hover hover:text-destructive"
                          aria-label="Delete memory"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SettingsGroup>
        </div>
      );
    case "chats":
      return (
        <SettingsGroup title="Chats">
          <SettingRow label="Save chat history" description="Store conversations in your account."><Switch defaultChecked /></SettingRow>
        </SettingsGroup>
      );
    case "about":
      return (
        <SettingsGroup title="About">
          <SettingRow label="Version" description="Upsilon AI web client.">
            <span className="text-[13.5px] text-foreground/70">2.4.1</span>
          </SettingRow>
          <SettingRow label="Terms of Service" description="Read our terms.">
            <Button variant="link" className="h-auto p-0">Open</Button>
          </SettingRow>
          <SettingRow label="Privacy Policy" description="How we handle data.">
            <Button variant="link" className="h-auto p-0">Open</Button>
          </SettingRow>
        </SettingsGroup>
      );
  }
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[13px] font-semibold text-foreground/90">{title}</div>
      <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-background">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <div className="text-[13.5px] font-medium">{label}</div>
        {description && <div className="text-[12px] text-foreground/50">{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useAppearance();
  const opts: { id: "light" | "dark" | "system"; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-foreground/15 bg-background p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] transition-colors",
            theme === o.id ? "surface-active text-foreground" : "text-foreground/60 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CompactToggle() {
  const { compact, setCompact } = useAppearance();
  return <Switch checked={compact} onCheckedChange={setCompact} />;
}

function ReducedMotionToggle() {
  const { reducedMotion, setReducedMotion } = useAppearance();
  return <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="my-1 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-[16px] w-[16px]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-foreground">Something went wrong</div>
        <div className="mt-0.5 text-[13.5px] text-foreground/70">{message}</div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImageAttachment({ url, onOpen }: { url: string; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="mt-3 max-w-[520px]">
      <button
        onClick={onOpen}
        className="group relative block w-full overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-16px_rgba(0,0,0,0.2)] transition-transform duration-200 hover:scale-[1.005] active:scale-[0.995]"
      >
        {!loaded && (
          <div className="flex aspect-[3/2] w-full items-center justify-center">
            <div className="flex items-center gap-2 text-[12.5px] text-foreground/50">
              <ImageIcon className="h-4 w-4 animate-pulse" strokeWidth={1.75} />
              Generating image…
            </div>
          </div>
        )}
        <img
          src={url}
          alt="Generated"
          onLoad={() => setLoaded(true)}
          className={cn(
            "block h-auto w-full transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/45 to-transparent px-3 py-2 text-[11.5px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          <span>Click to expand</span>
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
        </div>
      </button>
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!url) return;
    setScale(1);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(4, s + 0.25));
      else if (e.key === "-") setScale((s) => Math.max(0.5, s - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `upsilon-image-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(0.5, s - 0.25)); }}
          aria-label="Zoom out"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ZoomOut className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(4, s + 0.25)); }}
          aria-label="Zoom in"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ZoomIn className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); download(); }}
          aria-label="Download image"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <Download className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <img
        src={url}
        alt="Expanded view"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `scale(${scale})`, transition: "transform 0.2s ease" }}
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
      />
    </div>
  );
}

function DragDropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground/20 bg-background p-10 shadow-xl">
        <Paperclip className="h-10 w-10 text-foreground/40" strokeWidth={1.5} />
        <div className="text-[15px] font-medium text-foreground/60">Drop files here</div>
      </div>
    </div>
  );
}