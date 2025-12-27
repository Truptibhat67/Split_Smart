"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiQuery } from "@/hooks/use-api-query";

// Form schema validation
const settlementSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: "Amount must be a positive number",
    }),
  note: z.string().optional(),
  paymentType: z.enum(["youPaid", "theyPaid"]),
});

export default function SettlementForm({ entityType, entityData, onSuccess }) {
  // Always fetch the current user from the REST API
  const { data: currentUser } = useApiQuery("/api/users/me");
  const { mutate: createSettlement } = useApiMutation("/api/settlements", "POST");

  // Set up form with validation
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(settlementSchema),
    defaultValues: {
      amount: "",
      note: "",
      paymentType: "youPaid",
    },
  });

  // Get selected payment direction
  const paymentType = watch("paymentType");

  // Single user settlement
  const handleUserSettlement = async (data) => {
    const amount = parseFloat(data.amount);

    try {
      // Determine payer and receiver based on the selected payment type
      const paidByUserId =
        data.paymentType === "youPaid"
          ? currentUser._id
          : entityData.counterpart.userId;

      const receivedByUserId =
        data.paymentType === "youPaid"
          ? entityData.counterpart.userId
          : currentUser._id;

      await createSettlement({
        amount,
        note: data.note,
        paidByUserId,
        receivedByUserId,
        groupId: undefined,
      });

      toast.success("Settlement recorded successfully!");
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error("Failed to record settlement: " + error.message);
    }
  };

  // Group settlement between current user and a selected member
  const handleGroupSettlement = async (data, selectedUserId) => {
    if (!selectedUserId) {
      toast.error("Please select a group member to settle with");
      return;
    }

    const amount = parseFloat(data.amount);

    try {
      // Get the selected user from the group members
      const selectedUser = (entityData.members || []).find(
        (member) => String(member.userId) === String(selectedUserId)
      );

      if (!selectedUser) {
        toast.error("Selected user not found in group");
        return;
      }

      // Determine payer and receiver based on the selected payment type
      const paidByUserId =
        data.paymentType === "youPaid" ? currentUser._id : selectedUser.userId;

      const receivedByUserId =
        data.paymentType === "youPaid" ? selectedUser.userId : currentUser._id;

      await createSettlement({
        amount,
        note: data.note,
        paidByUserId,
        receivedByUserId,
        groupId: entityData.group.id,
      });

      toast.success("Settlement recorded successfully!");
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error("Failed to record settlement: " + error.message);
    }
  };

  // For group settlements, we need to select a member
  const [selectedGroupMemberId, setSelectedGroupMemberId] = useState(null);

  // Wait until current user is loaded for both flows
  if (!currentUser) return null;

  // Unified submit handler for both user and group settlements
  const onSubmit = async (data) => {
    if (entityType === "user") {
      await handleUserSettlement(data);
    } else if (entityType === "group") {
      await handleGroupSettlement(data, selectedGroupMemberId);
    }
  };

  // Render the form for individual settlement
  if (entityType === "user") {
    const otherUser = entityData.counterpart;
    const netBalance = entityData.netBalance;

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Balance information */}
        <div className="bg-muted p-4 rounded-lg">
          <h3 className="font-medium mb-2">Current balance</h3>
          {netBalance === 0 ? (
            <p>You are all settled up with {otherUser.name}</p>
          ) : netBalance > 0 ? (
            <div className="flex justify-between items-center">
              <p>
                <span className="font-medium">{otherUser.name}</span> owes you
              </p>
              <span className="text-xl font-bold text-green-600">
                ₹{netBalance.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <p>
                You owe <span className="font-medium">{otherUser.name}</span>
              </p>
              <span className="text-xl font-bold text-red-600">
                ₹{Math.abs(netBalance).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Payment direction */}
        <div className="space-y-2">
          <Label>Who paid?</Label>
          <RadioGroup
            defaultValue="youPaid"
            {...register("paymentType")}
            className="flex flex-col space-y-2"
            onValueChange={(value) => {
              // This manual approach is needed because RadioGroup doesn't work directly with react-hook-form
              register("paymentType").onChange({
                target: { name: "paymentType", value },
              });
            }}
          >
            <div className="flex items-center space-x-2 border rounded-md p-3">
              <RadioGroupItem value="youPaid" id="youPaid" />
              <Label htmlFor="youPaid" className="flex-grow cursor-pointer">
                <div className="flex items-center">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={currentUser.imageUrl} />
                    <AvatarFallback>
                      {currentUser.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span>You paid {otherUser.name}</span>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 border rounded-md p-3">
              <RadioGroupItem value="theyPaid" id="theyPaid" />
              <Label htmlFor="theyPaid" className="flex-grow cursor-pointer">
                <div className="flex items-center">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={otherUser.imageUrl} />
                    <AvatarFallback>{otherUser.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{otherUser.name} paid you</span>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5">₹</span>
            <Input
              id="amount"
              placeholder="0.00"
              type="number"
              step="0.01"
              min="0.01"
              className="pl-7"
              {...register("amount")}
            />
          </div>
          {errors.amount && (
            <p className="text-sm text-red-500">{errors.amount.message}</p>
          )}
        </div>

        {/* Note */}
        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea
            id="note"
            placeholder="Dinner, rent, etc."
            {...register("note")}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Recording..." : "Record settlement"}
        </Button>
      </form>
    );
  }

  // Render the form for group settlement
  const group = entityData.group;
  const members = entityData.members || [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Select member within the group */}
      <div className="space-y-2">
        <Label>Settle with</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedGroupMemberId || ""}
          onChange={(e) => setSelectedGroupMemberId(e.target.value || null)}
        >
          <option value="">Select a group member</option>
          {members
            .filter((m) => String(m.userId) !== String(currentUser._id))
            .map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || member.email}
              </option>
            ))}
        </select>
      </div>

      {/* Payment direction */}
      <div className="space-y-2">
        <Label>Who paid?</Label>
        <RadioGroup
          defaultValue="youPaid"
          {...register("paymentType")}
          className="flex flex-col space-y-2"
          onValueChange={(value) => {
            register("paymentType").onChange({
              target: { name: "paymentType", value },
            });
          }}
        >
          <div className="flex items-center space-x-2 border rounded-md p-3">
            <RadioGroupItem value="youPaid" id="youPaid-group" />
            <Label htmlFor="youPaid-group" className="flex-grow cursor-pointer">
              You paid a group member
            </Label>
          </div>

          <div className="flex items-center space-x-2 border rounded-md p-3">
            <RadioGroupItem value="theyPaid" id="theyPaid-group" />
            <Label htmlFor="theyPaid-group" className="flex-grow cursor-pointer">
              A group member paid you
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5">₹</span>
          <Input
            id="amount"
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0.01"
            className="pl-7"
            {...register("amount")}
          />
        </div>
        {errors.amount && (
          <p className="text-sm text-red-500">{errors.amount.message}</p>
        )}
      </div>

      {/* Note */}
      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          placeholder="Dinner, rent, etc."
          {...register("note")}
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !selectedGroupMemberId}
      >
        {isSubmitting ? "Recording..." : "Record settlement"}
      </Button>
    </form>
  );
}
