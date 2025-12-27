"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ParticipantSelector({ participants, onParticipantsChange }) {
  const { data: currentUser } = useApiQuery("/api/users/me");
  const { isSignedIn, user } = useUser();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const fetchUsers = async () => {
      try {
        if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        const headers = {
          "x-user-email": user.primaryEmailAddress.emailAddress || "",
          "x-user-name": user.fullName || "",
          "x-user-image": user.imageUrl || "",
        };

        const result = await apiClient.get(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { headers }
        );
        if (!cancelled) {
          setSearchResults(result || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("User search failed", err);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  // Add a participant
  const addParticipant = (user) => {
    // Check if already added
    if (participants.some((p) => p.id === user.id)) {
      return;
    }

    // Add to list
    onParticipantsChange([...participants, user]);
    setOpen(false);
    setSearchQuery("");
  };

  // Remove a participant
  const removeParticipant = (userId) => {
    // Don't allow removing yourself
    if (userId === currentUser._id) {
      return;
    }

    onParticipantsChange(participants.filter((p) => p.id !== userId));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {participants.map((participant) => (
          <Badge
            key={participant.id}
            variant="secondary"
            className="flex items-center gap-2 px-3 py-2"
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={participant.imageUrl} />
              <AvatarFallback>
                {participant.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <span>
              {participant.id === currentUser?._id
                ? "You"
                : participant.name || participant.email}
            </span>
            {participant.id !== currentUser?._id && (
              <button
                type="button"
                onClick={() => removeParticipant(participant.id)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        {participants.length < 2 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                type="button"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add person
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {searchQuery.length < 2 ? (
                      <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                        Type at least 2 characters to search
                      </p>
                    ) : isLoading ? (
                      <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                        Searching...
                      </p>
                    ) : (
                      <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                        No users found
                      </p>
                    )}
                  </CommandEmpty>
                  <CommandGroup heading="Users">
                    {searchResults?.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={user.name + user.email}
                        onSelect={() => addParticipant(user)}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={user.imageUrl} />
                            <AvatarFallback>
                              {user.name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm">{user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
