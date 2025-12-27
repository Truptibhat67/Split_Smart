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

export function GroupComments({ groupId, initialComments = [] }) {
  const { isSignedIn, user } = useUser();
  const [comments, setComments] = useState(() => initialComments || []);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);

  // Scroll to bottom whenever comments change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  const currentUserId = useMemo(() => {
    return user?.id || null;
  }, [user]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
      toast.error("You must be signed in to post a comment");
      return;
    }

    const optimisticComment = {
      userId: null,
      name: user.fullName || user.username || user.firstName || "You",
      email: user.primaryEmailAddress?.emailAddress,
      imageUrl: user.imageUrl,
      text: trimmed,
      createdAt: Date.now(),
    };

    // Show the new message immediately in the UI
    setComments((prev) => [...prev, optimisticComment]);
    setInput("");

    try {
      setIsSending(true);

      const headers = {
        "x-user-email": user.primaryEmailAddress.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      const res = await apiClient.post(
        `/api/groups/${groupId}/comments`,
        { text: trimmed },
        { headers }
      );

      const nextComments = res?.comments || [];
      if (nextComments.length) {
        setComments(nextComments);
      }
      toast.success("Comment posted to the group");
    } catch (error) {
      // If the request fails, remove the optimistic comment
      setComments((prev) => prev.filter((c) => c !== optimisticComment));
      toast.error(error?.message || "Failed to post comment");
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
        className="max-h-72 overflow-y-auto rounded-lg border bg-muted/40 p-3 space-y-3 text-sm">
        {comments && comments.length ? (
          comments.map((comment, idx) => {
            const isMe =
              currentUserId &&
              (String(comment.userId) === String(currentUserId) ||
                comment.email === user?.primaryEmailAddress?.emailAddress);

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 ${isMe ? "flex-row-reverse text-right" : ""}`}>
                <Avatar className="h-7 w-7 mt-0.5">
                  <AvatarImage src={comment.imageUrl} />
                  <AvatarFallback>
                    {(comment.name || comment.email || "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-background border rounded-bl-sm"
                  }`}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold opacity-80 truncate">
                      {comment.name || comment.email || "Member"}
                    </span>
                    <span className="text-[10px] opacity-60">
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {comment.text}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-1">
            <span>Start the conversation for this group ✨</span>
            <span>Share plans, bills or friendly reminders here.</span>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message for everyone in the group... "
          className="min-h-14 text-sm"
        />
        <Button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          className="sm:self-stretch sm:w-32 rounded-full">
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
