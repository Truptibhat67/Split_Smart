"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ParticipantSelector } from "./participant-selector";
import { GroupSelector } from "./group-selector";
import { CategorySelector } from "./category-selector";
import { SplitSelector } from "./split-selector";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { getAllCategories } from "@/lib/expense-categories";
import { useApiQuery } from "@/hooks/use-api-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Form schema validation
const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: "Amount must be a positive number",
    }),
  category: z.string().optional(),
  date: z.date(),
  paidByUserId: z.string().min(1, "Payer is required"),
  splitType: z.enum(["equal", "percentage", "exact"]),
  groupId: z.string().optional(),
});

export function ExpenseForm({ type = "individual", onSuccess }) {
  const [participants, setParticipants] = useState([]);
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [splits, setSplits] = useState([]);
  const [inclusionMode, setInclusionMode] = useState("all"); // "all" | "custom"
  const [includedMemberIds, setIncludedMemberIds] = useState([]);
  const [isIncludeDialogOpen, setIsIncludeDialogOpen] = useState(false);
  const [tempSelectedMemberIds, setTempSelectedMemberIds] = useState([]);

  // Mutations and queries
  const { data: currentUser } = useApiQuery("/api/users/me");
  const { mutate: createExpense, isLoading: isCreating } = useApiMutation(
    "/api/expenses",
    "POST"
  );
  const categories = getAllCategories();

  // Set up form with validation
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: "",
      category: "",
      date: new Date(),
      paidByUserId: currentUser?._id || "",
      splitType: "equal",
      groupId: undefined,
    },
  });

  // Watch for changes
  const amountValue = watch("amount");
  const paidByUserId = watch("paidByUserId");

  // When a user is added or removed, update the participant list
  useEffect(() => {
    if (participants.length === 0 && currentUser) {
      // Always add the current user as a participant
      setParticipants([
        {
          id: String(currentUser._id),
          name: currentUser.name,
          email: currentUser.email,
          imageUrl: currentUser.imageUrl,
        },
      ]);
    }
  }, [currentUser, participants]);

  // Handle form submission
  const onSubmit = async (data) => {
    try {
      const amount = parseFloat(data.amount);

      // Prepare splits in the format expected by the API
      const formattedSplits = splits.map((split) => ({
        userId: split.userId,
        amount: split.amount,
        paid: split.userId === data.paidByUserId,
      }));

      // Validate that splits add up to the total (with small tolerance)
      const totalSplitAmount = formattedSplits.reduce(
        (sum, split) => sum + split.amount,
        0
      );
      const tolerance = 0.01;

      if (Math.abs(totalSplitAmount - amount) > tolerance) {
        toast.error(
          `Split amounts don't add up to the total. Please adjust your splits.`
        );
        return;
      }

      // For 1:1 expenses, set groupId to undefined instead of empty string
      const groupId = type === "individual" ? undefined : data.groupId;

      // Create the expense via REST API
      await createExpense({
        description: data.description,
        amount: amount,
        category: data.category || "Other",
        date: data.date.getTime(), // Convert to timestamp
        paidByUserId: data.paidByUserId,
        splitType: data.splitType,
        splits: formattedSplits,
        groupId,
      });

      toast.success("Expense created successfully!");
      reset(); // Reset form

      const currentUserId = String(currentUser._id);
      const otherParticipant = participants.find(
        (p) => String(p.id) !== currentUserId
      );
      const otherUserId = otherParticipant ? String(otherParticipant.id) : null;

      if (!onSuccess) return;

      if (type === "individual" && otherUserId) {
        onSuccess(otherUserId);
      } else if (type === "group" && groupId) {
        onSuccess(groupId);
      }
    } catch (error) {
      toast.error("Failed to create expense: " + error.message);
    }
  };

  if (!currentUser) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        {/* Description and amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Lunch, movie tickets, etc."
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-red-500">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              placeholder="0.00"
              type="number"
              step="0.01"
              min="0.01"
              {...register("amount")}
            />
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount.message}</p>
            )}
          </div>
        </div>

        {/* Category and date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>

            <CategorySelector
              categories={categories || []}
              onChange={(categoryId) => {
                if (categoryId) {
                  setValue("category", categoryId);
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                  type="button"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  selectedDate={selectedDate}
                  onDateSelect={(date) => {
                    setSelectedDate(date);
                    setValue("date", date, { shouldValidate: true });
                    setIsCalendarOpen(false); // Close the popover after selection
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Group selector (for group expenses) */}
        {type === "group" && (
          <div className="space-y-2">
            <Label>Group</Label>
            <GroupSelector
              onChange={(group) => {
                // Only update if the group has changed to prevent loops
                if (!selectedGroup || selectedGroup.id !== group.id) {
                  setSelectedGroup(group);
                  setValue("groupId", group.id);

                  // Update participants with the group members
                  if (group.members && Array.isArray(group.members)) {
                    // Normalize group members into participant objects with stable ids
                    const normalizedParticipants = group.members.map((member) => ({
                      id:
                        member.userId?._id?.toString?.() ||
                        (typeof member.userId === "string"
                          ? member.userId
                          : ""),
                      name:
                        member.name ||
                        member.userId?.name ||
                        "Unknown",
                      email: member.email || member.userId?.email,
                      imageUrl: member.userId?.imageUrl,
                    }));

                    setGroupParticipants(normalizedParticipants);
                    setParticipants(normalizedParticipants);
                    const allIds = normalizedParticipants
                      .map((p) => (p.id ? String(p.id) : ""))
                      .filter(Boolean);
                    setIncludedMemberIds(allIds);
                    setInclusionMode("all");
                  }
                }
              }}
            />
            {!selectedGroup && (
              <p className="text-xs text-amber-600">
                Please select a group to continue
              </p>
            )}
          </div>
        )}

        {/* Included members */}
        {type === "group" && selectedGroup && groupParticipants.length > 0 && (
          <div className="mt-4 space-y-2">
            <Label>Included members</Label>
            <div className="flex items-center gap-3">
              <select
                className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={inclusionMode}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "all") {
                    setInclusionMode("all");
                    setParticipants(groupParticipants);
                    const allIds = groupParticipants
                      .map((p) => (p.id ? String(p.id) : ""))
                      .filter(Boolean);
                    setIncludedMemberIds(allIds);
                  } else {
                    // Exclude member -> open dialog to choose included members
                    setInclusionMode("custom");
                    const currentIds =
                      includedMemberIds.length > 0
                        ? includedMemberIds
                        : groupParticipants
                            .map((p) => (p.id ? String(p.id) : ""))
                            .filter(Boolean);
                    setTempSelectedMemberIds(currentIds);
                    setIsIncludeDialogOpen(true);
                  }
                }}
              >
                <option value="all">All members</option>
                <option value="custom">Exclude member</option>
              </select>
            </div>

            <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-2">
              {inclusionMode === "all" ||
              includedMemberIds.length ===
                groupParticipants.filter((p) => p.id).length ? (
                <span>All group members</span>
              ) : (
                groupParticipants
                  .filter((p) =>
                    includedMemberIds.includes(p.id ? String(p.id) : "")
                  )
                  .map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-muted px-3 py-1 text-xs"
                    >
                      {p.name}
                    </span>
                  ))
              )}
            </div>
          </div>
        )}

        {/* Participants (for individual expenses) */}
        {type === "individual" && (
          <div className="space-y-2">
            <Label>Participants</Label>
            <ParticipantSelector
              participants={participants}
              onParticipantsChange={setParticipants}
            />
            {participants.length <= 1 && (
              <p className="text-xs text-amber-600">
                Please add at least one other participant
              </p>
            )}
          </div>
        )}

        {/* Paid by selector */}
        <div className="space-y-2">
          <Label>Paid by</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...register("paidByUserId")}
          >
            <option key="placeholder" value="">
              Select who paid
            </option>
            {participants.map((participant, index) => {
              const value = String(participant.id || participant.email || index);
              const key = value || `participant-${index}`;
              return (
                <option key={key} value={value}>
                  {String(participant.id) === String(currentUser._id)
                    ? "You"
                    : participant.name}
                </option>
              );
            })}
          </select>
          {errors.paidByUserId && (
            <p className="text-sm text-red-500">
              {errors.paidByUserId.message}
            </p>
          )}
        </div>

        {/* Split type */}
        <div className="space-y-2">
          <Label>Split type</Label>
          <Tabs
            defaultValue="equal"
            onValueChange={(value) => setValue("splitType", value)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="equal">Equal</TabsTrigger>
              <TabsTrigger value="percentage">Percentage</TabsTrigger>
              <TabsTrigger value="exact">Exact Amounts</TabsTrigger>
            </TabsList>
            <TabsContent value="equal" className="pt-4">
              <p className="text-sm text-muted-foreground">
                Split equally among all participants
              </p>
              <SplitSelector
                type="equal"
                amount={parseFloat(amountValue) || 0}
                participants={participants}
                paidByUserId={paidByUserId}
                onSplitsChange={setSplits} // Use setSplits directly
              />
            </TabsContent>
            <TabsContent value="percentage" className="pt-4">
              <p className="text-sm text-muted-foreground">
                Split by percentage
              </p>
              <SplitSelector
                type="percentage"
                amount={parseFloat(amountValue) || 0}
                participants={participants}
                paidByUserId={paidByUserId}
                onSplitsChange={setSplits} // Use setSplits directly
              />
            </TabsContent>
            <TabsContent value="exact" className="pt-4">
              <p className="text-sm text-muted-foreground">
                Enter exact amounts
              </p>
              <SplitSelector
                type="exact"
                amount={parseFloat(amountValue) || 0}
                participants={participants}
                paidByUserId={paidByUserId}
                onSplitsChange={setSplits} // Use setSplits directly
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Included members dialog for group expenses */}
      {type === "group" && selectedGroup && groupParticipants.length > 0 && (
        <Dialog
          open={isIncludeDialogOpen}
          onOpenChange={setIsIncludeDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select included members</DialogTitle>
            </DialogHeader>
            <div className="max-h-64 overflow-y-auto space-y-2 mt-2">
              {groupParticipants.map((member) => {
                const id = member.id ? String(member.id) : "";
                if (!id) return null;
                const checked = tempSelectedMemberIds.includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() => {
                        setTempSelectedMemberIds((prev) => {
                          if (prev.includes(id)) {
                            return prev.filter((v) => v !== id);
                          }
                          return [...prev, id];
                        });
                      }}
                    />
                    <span>{member.name}</span>
                  </label>
                );
              })}
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                onClick={() => {
                  const allIds = groupParticipants
                    .map((p) => (p.id ? String(p.id) : ""))
                    .filter(Boolean);
                  const finalIds =
                    tempSelectedMemberIds.length > 0
                      ? tempSelectedMemberIds
                      : allIds;
                  setIncludedMemberIds(finalIds);
                  const finalParticipants = groupParticipants.filter((p) =>
                    finalIds.includes(p.id ? String(p.id) : "")
                  );
                  setParticipants(finalParticipants);
                  setIsIncludeDialogOpen(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || participants.length <= 1}
        >
          {isSubmitting ? "Creating..." : "Create Expense"}
        </Button>
      </div>
    </form>
  );
}
