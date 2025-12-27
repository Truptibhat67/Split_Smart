"use client";

import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getCategoryById } from "@/lib/expense-categories";
import { getCategoryIcon } from "@/lib/expense-categories";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { useState } from 'react';

export function ExpenseList({
  expenses,
  showOtherPerson = true,
  isGroupExpense = false,
  otherPersonId = null,
  otherPersonName = null,
  userLookupMap = {},
  currentUserId = null,
  showAllByDefault = false,
}) {
  const [showAll, setShowAll] = useState(showAllByDefault);
  const displayExpenses = showAll ? expenses : expenses.slice(0, 5);
  if (!expenses || !expenses.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No expenses found
        </CardContent>
      </Card>
    );
  }

  // Helper to get user details from cache or look up from expense
  const getUserDetails = (userId) => {
    // Look up user info from the provided map; fall back to a generic label
    const user = userLookupMap[userId];
    return {
      name:
        user?.name ||
        (otherPersonId && String(userId) === String(otherPersonId) && otherPersonName) ||
        "Other User",
      imageUrl: user?.imageUrl || null,
      id: userId,
    };
  };

  // Check if the user can delete an expense (creator or payer)
  const canDeleteExpense = () => false;

  // Handle delete expense
  const handleDeleteExpense = async (expense) => {
    // Use basic JavaScript confirm
    const confirmed = window.confirm(
      "Are you sure you want to delete this expense? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      // TODO: wire up REST delete endpoint when backend supports it
      toast.error("Deleting expenses is not yet supported in this version.");
    } catch (error) {
      toast.error("Failed to delete expense: " + (error.message || "Unknown error"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {displayExpenses.map((expense) => {
        const payer = getUserDetails(expense.paidByUserId, expense);
        const isCurrentUserPayer =
          currentUserId && String(expense.paidByUserId) === String(currentUserId);
        const category = getCategoryById(expense.category);
        const CategoryIcon = getCategoryIcon(category.id);
        const showDeleteOption = canDeleteExpense(expense);

        return (
          <Card
            className="hover:bg-muted/30 transition-colors"
            key={expense._id}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Category icon */}
                  <div className="bg-primary/10 p-2 rounded-full">
                    <CategoryIcon className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <h3 className="font-medium">{expense.description}</h3>
                    <div className="flex items-center text-sm text-muted-foreground gap-2">
                      <span>
                        {format(new Date(expense.date), "MMM d, yyyy")}
                      </span>
                      {showOtherPerson && (
                        <>
                          <span>•</span>
                          <span>
                            {isCurrentUserPayer ? "You" : payer.name} paid
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-medium">
                      ₹{expense.amount.toFixed(2)}
                    </div>
                    {isGroupExpense ? (
                      <Badge variant="outline" className="mt-1">
                        Group expense
                      </Badge>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <span className="text-muted-foreground">
                          {payer.name} paid
                        </span>
                      </div>
                    )}
                  </div>

                  {showDeleteOption && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-red-500 hover:text-red-700 hover:bg-red-100"
                      onClick={() => handleDeleteExpense(expense)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete expense</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Display splits info */}
              <div className="mt-3 text-sm">
                <div className="flex gap-2 flex-wrap">
                  {expense.splits.map((split, idx) => {
                    const splitUser = getUserDetails(split.userId, expense);
                    const isCurrentUser =
                      currentUserId &&
                      String(split.userId) === String(currentUserId);
                    const shouldShow =
                      showOtherPerson ||
                      (!showOtherPerson &&
                        ((currentUserId &&
                          String(split.userId) === String(currentUserId)) ||
                          (otherPersonId &&
                            String(split.userId) === String(otherPersonId))));

                    if (!shouldShow) return null;

                    return (
                      <Badge
                        key={idx}
                        variant={split.paid ? "outline" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={splitUser.imageUrl} />
                          <AvatarFallback>
                            {splitUser.name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {isCurrentUser ? "You" : splitUser.name}: ₹
                          {split.amount.toFixed(2)}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {expenses.length > 5 && (
        <div className="flex justify-center mt-2">
          <Button
            variant="ghost"
            onClick={() => setShowAll(!showAll)}
            className="text-primary hover:bg-primary/10"
          >
            {showAll ? 'Show Less' : `Show All (${expenses.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
