"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useApiQuery } from "@/hooks/use-api-query";
import { apiClient } from "@/lib/api-client";

const groupSchema = z.object({
  // Trim so that names with only spaces are treated as empty on the frontend too
  name: z
    .string()
    .trim()
    .min(1, "Group name is required"),
  description: z.string().optional(),
});

export function CreateGroupModal({ isOpen, onClose, onSuccess }) {
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const { data: currentUser } = useApiQuery("/api/users/me");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const { isSignedIn, user } = useUser();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Fetch search results when query changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    if (!isSignedIn) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const fetchUsers = async () => {
      try {
        setIsSearching(true);
        const headers = {
          "x-user-email": user?.primaryEmailAddress?.emailAddress || "",
          "x-user-name": user?.fullName || "",
          "x-user-image": user?.imageUrl || "",
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
          toast.error("Failed to search users");
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, isSignedIn, user]);

  const isValidEmail = (value) => {
    if (!value) return false;
    return /.+@.+\..+/.test(value.trim());
  };

  const addMember = (user) => {
    setSelectedMembers((prev) => {
      if (prev.some((m) => m.id === user.id)) return prev;
      return [...prev, user];
    });
    setCommandOpen(false);
  };

  const addEmailAsMember = async (email) => {
    try {
      const trimmed = email.trim();
      if (!isValidEmail(trimmed)) return;

      const existing = selectedMembers.find(
        (m) => m.email && m.email.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        setCommandOpen(false);
        return;
      }

      if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
        toast.error("You must be signed in to add members");
        return;
      }

      const headers = {
        "x-user-email": user.primaryEmailAddress?.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      const ensured = await apiClient.post(
        `/api/users/ensure?email=${encodeURIComponent(trimmed)}&name=${encodeURIComponent(
          trimmed.split("@")[0]
        )}`,
        {
          email: trimmed,
          name: trimmed.split("@")[0],
        },
        { headers }
      );

      if (ensured?.id) {
        setSelectedMembers((prev) => [
          ...prev,
          {
            id: ensured.id,
            name: ensured.name,
            email: ensured.email,
            imageUrl: ensured.imageUrl,
          },
        ]);
      }
      setCommandOpen(false);
      toast.success(`Added ${trimmed} to the group`);
    } catch (err) {
      console.error("Failed to add email as member", err);
      toast.error("Failed to add this email as a member");
    }
  };

  const removeMember = (userId) => {
    setSelectedMembers(selectedMembers.filter((m) => m.id !== userId));
  };

  const onSubmit = async (data) => {
    try {
      // Temporary debug to ensure we're actually sending the name the user typed
      console.log("[CreateGroupModal] submitting", data, selectedMembers);
      // Extract member IDs
      const memberIds = selectedMembers.map((member) => member.id);

      if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
        toast.error("You must be signed in to create a group");
        return;
      }

      const headers = {
        "x-user-email": user.primaryEmailAddress?.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      // Create the group via REST API
      const trimmedName = (data.name || "").trim();
      const response = await apiClient.post(
        `/api/groups?name=${encodeURIComponent(trimmedName)}`,
        {
          // zod schema already trims, but we trim again defensively here
          name: trimmedName,
          description: data.description,
          members: memberIds,
        },
        { headers }
      );
      const groupId = response?.id;

      // Success
      toast.success("Group created successfully!");
      reset();
      setSelectedMembers([]);
      onClose();

      // Redirect to the new group page
      if (onSuccess) {
        onSuccess(groupId);
      }
    } catch (error) {
      toast.error("Failed to create group: " + error.message);
    }
  };

  const handleClose = () => {
    reset();
    setSelectedMembers([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Group</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name</Label>
            <Input
              id="name"
              placeholder="Enter group name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Enter group description"
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Members</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {/* Current user (always included) */}
              {currentUser && (
                <Badge variant="secondary" className="px-3 py-1">
                  <Avatar className="h-5 w-5 mr-2">
                    <AvatarImage src={currentUser.imageUrl} />
                    <AvatarFallback>
                      {currentUser.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{currentUser.name} (You)</span>
                </Badge>
              )}

              {/* Selected members */}
              {selectedMembers.map((member) => (
                <Badge
                  key={member.id}
                  variant="secondary"
                  className="px-3 py-1"
                >
                  <Avatar className="h-5 w-5 mr-2">
                    <AvatarImage src={member.imageUrl} />
                    <AvatarFallback>
                      {member.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.name}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}

              {/* Add member button with dropdown */}
              <Popover open={commandOpen} onOpenChange={setCommandOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add member
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start" side="bottom">
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
                        ) : isSearching ? (
                          <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                            Searching...
                          </p>
                        ) : isValidEmail(searchQuery) ? (
                          <button
                            type="button"
                            className="w-full text-left py-3 px-4 text-sm text-green-700 hover:bg-green-50"
                            onClick={() => addEmailAsMember(searchQuery)}
                          >
                            Add {searchQuery} as a member
                          </button>
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
                            onSelect={() => addMember(user)}
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
            </div>
            {selectedMembers.length === 0 && (
              <p className="text-sm text-amber-600">
                Add at least one other person to the group
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || selectedMembers.length === 0}
            >
              {isSubmitting ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
