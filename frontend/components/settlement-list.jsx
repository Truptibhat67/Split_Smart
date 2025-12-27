"use client";

import { useState } from 'react';
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SettlementList({
  settlements,
  isGroupSettlement = false,
  userLookupMap = {},
  otherPersonId = null,
  otherPersonName = null,
  showAllByDefault = false,
}) {
  const [showAll, setShowAll] = useState(showAllByDefault);
  const displaySettlements = showAll ? settlements : (settlements || []).slice(0, 5);
  if (!settlements || !settlements.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No settlements found
        </CardContent>
      </Card>
    );
  }

  // Helper to get user details from cache or look up
  const getUserDetails = (userId) => {
    const user = userLookupMap?.[userId];
    return {
      name:
        user?.name ||
        (otherPersonId && String(userId) === String(otherPersonId) && otherPersonName) ||
        "Other User",
      imageUrl: user?.imageUrl || null,
      id: userId,
    };
  };

  return (
    <div className="flex flex-col gap-4">
      {displaySettlements.map((settlement) => {
        const payer = getUserDetails(settlement.paidByUserId);
        const receiver = getUserDetails(settlement.receivedByUserId);
        const isCurrentUserPayer = false;
        const isCurrentUserReceiver = false;

        return (
          <Card
            className="hover:bg-muted/30 transition-colors"
            key={settlement._id}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Settlement icon */}
                  <div className="bg-primary/10 p-2 rounded-full">
                    <ArrowLeftRight className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <h3 className="font-medium">
                      {`${payer.name} paid ${receiver.name}`}
                    </h3>
                    <div className="flex items-center text-sm text-muted-foreground gap-2">
                      <span>
                        {format(new Date(settlement.date), "MMM d, yyyy")}
                      </span>
                      {settlement.note && (
                        <>
                          <span>•</span>
                          <span>{settlement.note}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-medium">
                    ₹{settlement.amount.toFixed(2)}
                  </div>
                  {isGroupSettlement ? (
                    <Badge variant="outline" className="mt-1">
                      Group settlement
                    </Badge>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {isCurrentUserPayer ? (
                        <span className="text-amber-600">You paid</span>
                      ) : isCurrentUserReceiver ? (
                        <span className="text-green-600">You received</span>
                      ) : (
                        <span>Payment</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {settlements?.length > 5 && (
        <div className="flex justify-center mt-2">
          <Button
            variant="ghost"
            onClick={() => setShowAll(!showAll)}
            className="text-primary hover:bg-primary/10"
          >
            {showAll ? 'Show Less' : `Show All (${settlements.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
