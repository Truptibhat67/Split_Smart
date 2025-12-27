"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

function formatTime(timestamp) {
  try {
    const d = new Date(Number(timestamp));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export function ContactChat({ otherUserId, initialMessages = [] }) {
  const { isSignedIn, user } = useUser();
  const [messages, setMessages] = useState(() => initialMessages || []);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Keep local messages in sync if the parent refetches chat data
  useEffect(() => {
    if (Array.isArray(initialMessages)) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  const currentUserEmail = useMemo(
    () => user?.primaryEmailAddress?.emailAddress || null,
    [user]
  );

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (!isSignedIn || !currentUserEmail) {
      toast.error("You must be signed in to send a message");
      return;
    }

    const optimisticMessage = {
      userId: null,
      name: user.fullName || user.username || user.firstName || "You",
      email: currentUserEmail,
      imageUrl: user.imageUrl,
      text: trimmed,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");

    try {
      setIsSending(true);

      const headers = {
        "x-user-email": currentUserEmail,
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      const res = await apiClient.post(
        "/api/contacts/chat",
        { otherUserId, text: trimmed },
        { headers }
      );

      const next = res?.messages || [];
      if (next.length) {
        setMessages(next);
      }
      toast.success("Message sent");
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m !== optimisticMessage));
      toast.error(error?.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto rounded-lg border bg-muted/40 p-3 space-y-3 text-sm"
      >
        {messages && messages.length ? (
          messages.map((message, idx) => {
            const isMe =
              currentUserEmail &&
              message.email &&
              message.email.toLowerCase() === currentUserEmail.toLowerCase();

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 ${isMe ? "flex-row-reverse text-right" : ""}`}
              >
                <Avatar className="h-7 w-7 mt-0.5">
                  <AvatarImage src={message.imageUrl} />
                  <AvatarFallback>
                    {(message.name || message.email || "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-background border rounded-bl-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold opacity-80 truncate">
                      {message.name || message.email || "Contact"}
                    </span>
                    <span className="text-[10px] opacity-60">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-1">
            <span>No messages yet.</span>
            <span>Say hi and start a chat with this contact.</span>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Ctrl+Enter to send)"
          className="min-h-14 text-sm"
        />
        <Button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          className="sm:self-stretch sm:w-32 rounded-full"
        >
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
