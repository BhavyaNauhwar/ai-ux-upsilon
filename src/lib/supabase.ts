import { createClient } from "@supabase/supabase-js";

export type PersistedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  streaming?: boolean;
  imageUrl?: string;
  error?: boolean;
  attachments?: Array<{ kind: "image" | "pdf"; name: string; publicUrl?: string; storagePath?: string }>;
};

export type PersistedChat = {
  id: string;
  title: string;
  pinned?: boolean;
  updatedAt: number;
  messages: PersistedMessage[];
};

export type Memory = {
  id: string;
  user_id: string;
  content: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export function buildChatPayload(chat: PersistedChat) {
  return {
    id: chat.id,
    title: chat.title.trim(),
    pinned: Boolean(chat.pinned),
    updated_at: new Date(chat.updatedAt).toISOString(),
    messages: chat.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: new Date(message.createdAt).toISOString(),
      streaming: false, // never persist streaming state
      image_url: message.imageUrl ?? null,
      error: Boolean(message.error),
      // Persist attachment metadata (publicUrl may be a Supabase signed URL or data URL)
      // Note: data URLs for images can be large — they're stored in JSONB
      attachments: message.attachments
        ? message.attachments.map((a) => ({
            kind: a.kind,
            name: a.name,
            public_url: a.publicUrl ?? null,
            storage_path: a.storagePath ?? null,
          }))
        : null,
    })),
  };
}

export async function loadChatsForUser(userId: string): Promise<PersistedChat[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("chats")
    .select("id, title, pinned, updated_at, messages")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Unable to load chats from Supabase", error);
    return null;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title ?? "Untitled chat",
    pinned: Boolean(row.pinned),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
    messages: Array.isArray(row.messages)
      ? row.messages.map((message: any) => ({
          id: message.id,
          role: message.role,
          content: message.content ?? "",
          createdAt: Date.parse(message.created_at) || Date.now(),
          streaming: false, // never restore streaming state
          imageUrl: message.image_url ?? undefined,
          error: Boolean(message.error),
          // Restore attachment metadata
          attachments: Array.isArray(message.attachments)
            ? message.attachments.map((a: any) => ({
                kind: a.kind as "image" | "pdf",
                name: a.name ?? "",
                publicUrl: a.public_url ?? undefined,
                storagePath: a.storage_path ?? undefined,
              }))
            : undefined,
        }))
      : [],
  }));
}

export async function saveChatsForUser(chats: PersistedChat[], userId: string) {
  if (!supabase) return;

  const rows = chats.map((chat) => ({
    ...buildChatPayload(chat),
    user_id: userId,
  }));

  const { error } = await supabase.from("chats").upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("Unable to sync chats with Supabase", error);
  }
}

export async function deleteChatFromSupabase(chatId: string) {
  if (!supabase) return;
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) console.error("Unable to delete chat from Supabase", error);
}

export async function uploadAttachmentToSupabase(
  userId: string,
  chatId: string,
  file: File,
  kind: "image" | "pdf",
) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${userId}/${chatId}/${crypto.randomUUID()}-${safeFileName}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("chat-files")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  // Use signed URL for private bucket
  const { data: signedData } = await supabase.storage
    .from("chat-files")
    .createSignedUrl(uploadData?.path ?? storagePath, 60 * 60 * 24 * 7); // 7 days

  const { error: insertError } = await supabase.from("files").insert({
    user_id: userId,
    chat_id: chatId,
    storage_path: uploadData?.path ?? storagePath,
    file_name: safeFileName,
    kind,
    public_url: signedData?.signedUrl ?? null,
  });

  if (insertError) {
    throw insertError;
  }

  return {
    path: uploadData?.path ?? storagePath,
    publicUrl: signedData?.signedUrl ?? null,
  };
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Memories ─────────────────────────────────────────────────────────────────

export async function loadMemoriesForUser(userId: string): Promise<Memory[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Unable to load memories", error);
    return [];
  }
  return (data ?? []) as Memory[];
}

export async function saveMemory(userId: string, content: string, category?: string): Promise<Memory | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("memories")
    .insert({ user_id: userId, content, category: category ?? null })
    .select()
    .single();
  if (error) {
    console.error("Unable to save memory", error);
    return null;
  }
  return data as Memory;
}

export async function deleteMemory(memoryId: string) {
  if (!supabase) return;
  const { error } = await supabase.from("memories").delete().eq("id", memoryId);
  if (error) console.error("Unable to delete memory", error);
}

export async function updateMemory(memoryId: string, content: string): Promise<Memory | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("memories")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .select()
    .single();
  if (error) {
    console.error("Unable to update memory", error);
    return null;
  }
  return data as Memory;
}

// ── Profiles & Paid Access ──────────────────────────────────────────────────

export async function getUserPaidStatus(userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_paid")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Unable to load profile", error);
      const { data: userData } = await supabase.auth.getUser();
      return Boolean(userData.user?.user_metadata?.is_paid);
    }
    if (data) return Boolean(data.is_paid);

    // Fallback if profile row doesn't exist yet
    const { data: userData } = await supabase.auth.getUser();
    return Boolean(userData.user?.user_metadata?.is_paid);
  } catch {
    return false;
  }
}

export async function setUserPaidStatus(userId: string, isPaid: boolean): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, is_paid: isPaid, updated_at: new Date().toISOString() }, { onConflict: "id" });

    if (profileErr) {
      console.error("Unable to update profile status in DB", profileErr);
    }

    await supabase.auth.updateUser({
      data: { is_paid: isPaid },
    });

    return true;
  } catch (err) {
    console.error("Error setting paid status", err);
    return false;
  }
}

