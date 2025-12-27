"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, ArrowDownCircle, Bell, ChevronDown } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

/**
 * Expected `balances` shape (one object per member):
 * {
 *   id:           string;           // user id
 *   name:         string;
 *   imageUrl?:    string;
 *   totalBalance: number;           // + ve ⇒ they are owed, – ve ⇒ they owe
 *   owes:   { to: string;   amount: number }[];  // this member → others
 *   owedBy: { from: string; amount: number }[];  // others → this member
 * }
 */
export function GroupBalances({
  balances = [],
  members = [],
  expenses = [],
  settlements = [],
  groupId,
}) {
  /* ───── data + guards ─────────────────────────────────────────────────── */
  const { data: currentUser } = useApiQuery("/api/users/me");
  const { isSignedIn, user } = useUser();
  const currentUserId = currentUser?._id;
  const [showReminderMenu, setShowReminderMenu] = React.useState(false);

  if (!currentUserId) {
    return null;
  }

  if (!members.length && !expenses.length && !settlements.length && !balances.length) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No balance information available
      </div>
    );
  }

  // Compute pairwise net balances BETWEEN current user and each other member
  // >0 => they owe you; <0 => you owe them
  const netByUser = {};

  const addToNet = (userId, delta) => {
    if (!userId || String(userId) === String(currentUserId)) return;
    const key = String(userId);
    netByUser[key] = (netByUser[key] || 0) + delta;
  };

  const handleReminderAllAction = async (mode) => {
    if (mode === "now") {
      await handleSendReminderAll();
      return;
    }

    if (mode === "monthly") {
      if (!groupId) {
        toast.error("Group information is missing");
        return;
      }

      try {
        if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
          toast.error("You must be signed in to save reminders");
          return;
        }

        const headers = {
          "x-user-email": user.primaryEmailAddress.emailAddress || "",
          "x-user-name": user.fullName || "",
          "x-user-image": user.imageUrl || "",
        };

        await apiClient.post(
          "/api/reminders/preferences",
          {
            scopeType: "group",
            scopeId: groupId,
            frequency: "monthly",
          },
          { headers }
        );

        toast.success("Monthly reminders (1st of month) saved for this group");
      } catch (error) {
        toast.error(error?.message || "Failed to save reminder preference");
      }
    }
  };

  // 1) Apply group expenses
  for (const e of expenses) {
    const payerId = e.paidByUserId ? String(e.paidByUserId) : null;
    const splits = e.splits || [];

    if (!payerId) continue;

    // Case A: you are the payer – others may owe you
    if (String(payerId) === String(currentUserId)) {
      for (const s of splits) {
        const splitUserId = s.userId ? String(s.userId) : null;
        if (!splitUserId || String(splitUserId) === String(currentUserId) || s.paid) continue;
        addToNet(splitUserId, s.amount); // they owe you
      }
    }

    // Case B: someone else is payer and you are in splits
    const mySplit = splits.find(
      (s) => String(s.userId) === String(currentUserId)
    );
    if (mySplit && !mySplit.paid && String(payerId) !== String(currentUserId)) {
      addToNet(payerId, -mySplit.amount); // you owe them
    }
  }

  // 2) Apply group settlements between you and others
  for (const s of settlements) {
    const paidById = s.paidByUserId ? String(s.paidByUserId) : null;
    const receivedById = s.receivedByUserId ? String(s.receivedByUserId) : null;
    if (!paidById || !receivedById) continue;

    // You paid someone else back
    if (paidById === String(currentUserId) && receivedById !== String(currentUserId)) {
      addToNet(receivedById, -s.amount);
    }

    // Someone else paid you back
    if (receivedById === String(currentUserId) && paidById !== String(currentUserId)) {
      addToNet(paidById, s.amount);
    }
  }

  const entries = Object.entries(netByUser);
  const myBalance = entries.reduce((sum, [, v]) => sum + v, 0);

  const owedToYou = entries
    .filter(([, v]) => v > 0.01)
    .map(([userId, amount]) => {
      const member =
        members.find((m) => String(m.userId) === userId) ||
        balances.find((b) => String(b.id) === userId) || {};
      return {
        id: userId,
        name: member.name || member.userId?.name || "Unknown",
        imageUrl: member.imageUrl || member.userId?.imageUrl,
        total: amount,
      };
    });

  const youOwe = entries
    .filter(([, v]) => v < -0.01)
    .map(([userId, amount]) => {
      const member =
        members.find((m) => String(m.userId) === userId) ||
        balances.find((b) => String(b.id) === userId) || {};
      return {
        id: userId,
        name: member.name || member.userId?.name || "Unknown",
        imageUrl: member.imageUrl || member.userId?.imageUrl,
        total: amount,
      };
    });

  const isAllSettledUp =
    (Math.abs(myBalance) < 0.01 || Number.isNaN(myBalance)) &&
    owedToYou.length === 0 &&
    youOwe.length === 0;

  // Build full pairwise group balances: for every pair of members, compute
  // the net "who owes whom" based on all group expenses and settlements.
  // This is used to show a comprehensive "A owes B X" list for the
  // Group balances (who owes whom) section.
  const pairwiseOwes = (() => {
    if (!members?.length || (!expenses?.length && !settlements?.length)) {
      return [];
    }

    // Map for directional amounts: key = "fromId->toId", value = amount owed
    const directional = {};

    const addDirectional = (fromId, toId, delta) => {
      if (!fromId || !toId) return;
      const from = String(fromId);
      const to = String(toId);
      if (from === to) return;
      const key = `${from}->${to}`;
      directional[key] = (directional[key] || 0) + delta;
    };

    // 1) Apply all group expenses: each split user owes the payer their share
    for (const e of expenses || []) {
      const payerId = e.paidByUserId ? String(e.paidByUserId) : null;
      if (!payerId) continue;

      for (const s of e.splits || []) {
        const splitUserId = s.userId ? String(s.userId) : null;
        if (!splitUserId || splitUserId === payerId || s.paid) continue;
        if (typeof s.amount !== "number" || s.amount <= 0) continue;
        // splitUser owes payer
        addDirectional(splitUserId, payerId, s.amount);
      }
    }

    // 2) Apply group settlements: when someone pays another, it reduces their debt
    for (const s of settlements || []) {
      const paidById = s.paidByUserId ? String(s.paidByUserId) : null;
      const receivedById = s.receivedByUserId ? String(s.receivedByUserId) : null;
      if (!paidById || !receivedById || paidById === receivedById) continue;
      if (typeof s.amount !== "number" || s.amount <= 0) continue;
      // Paying back reduces how much paidBy owes receivedBy
      addDirectional(paidById, receivedById, -s.amount);
    }

    // 3) For each unordered pair (a,b), compute net = (a->b) - (b->a).
    // If net > 0, a owes b net. If net < 0, b owes a -net.
    const memberIds = members
      .map((m) => (m.userId ? String(m.userId) : null))
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(memberIds));

    const lookupMember = (id) => {
      const fromMembers = members.find((m) => String(m.userId) === String(id));
      const fromBalances = balances.find((b) => String(b.id) === String(id));
      return {
        id: String(id),
        name:
          fromMembers?.name ||
          fromBalances?.name ||
          fromMembers?.userId?.name ||
          "Unknown",
        imageUrl: fromMembers?.imageUrl || fromBalances?.imageUrl,
      };
    };

    const results = [];

    for (let i = 0; i < uniqueIds.length; i += 1) {
      for (let j = i + 1; j < uniqueIds.length; j += 1) {
        const a = uniqueIds[i];
        const b = uniqueIds[j];

        // Skip pairs that involve the current user – we only want
        // other members' mutual balances in this section.
        if (
          String(a) === String(currentUserId) ||
          String(b) === String(currentUserId)
        ) {
          continue;
        }
        const keyAB = `${a}->${b}`;
        const keyBA = `${b}->${a}`;
        const ab = directional[keyAB] || 0;
        const ba = directional[keyBA] || 0;
        const net = ab - ba;

        if (Math.abs(net) <= 0.01) continue;

        if (net > 0) {
          // a owes b
          results.push({
            from: lookupMember(a),
            to: lookupMember(b),
            amount: net,
          });
        } else {
          // b owes a
          results.push({
            from: lookupMember(b),
            to: lookupMember(a),
            amount: -net,
          });
        }
      }
    }

    // Sort by largest amounts first for readability
    results.sort((x, y) => y.amount - x.amount);

    return results;
  })();

  const sendReminderForMember = async (member) => {
    try {
      if (!groupId) {
        toast.error("Group information is missing");
        return;
      }

      if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
        toast.error("You must be signed in to send reminders");
        return;
      }

      const headers = {
        "x-user-email": user.primaryEmailAddress.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      await apiClient.post(
        `/api/groups/${groupId}/remind`,
        {
          toUserId: member.id,
          amount: Number(member.total || 0),
        },
        { headers }
      );

      toast.success(`Reminder sent to ${member.name}`);
    } catch (error) {
      toast.error(error?.message || "Failed to send reminder");
    }
  };

  const handleSendReminderAll = async () => {
    if (!owedToYou.length) {
      toast.error("No pending amounts to remind");
      return;
    }

    try {
      for (const member of owedToYou) {
        // Fire requests sequentially to avoid overwhelming SMTP in small setups
        // and to surface any individual errors via toast
        // eslint-disable-next-line no-await-in-loop
        await sendReminderForMember(member);
      }
    } catch (error) {
      // Individual errors are already toasted in sendReminderForMember
      console.error("Error while sending one or more reminders", error);
    }
  };

  /* ───── UI ────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Your balance summary */}
      <div className="text-center pb-4 border-b space-y-1">
        <p className="text-sm text-muted-foreground">Your balance</p>
        <p className="text-2xl font-bold">
          {myBalance > 0.01 ? (
            <span className="text-green-600">
              +₹{myBalance.toFixed(2)}
            </span>
          ) : myBalance < -0.01 ? (
            <span className="text-red-600">
              -₹{Math.abs(myBalance).toFixed(2)}
            </span>
          ) : (
            <span>₹0.00</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {myBalance > 0.01
            ? "You are owed money"
            : myBalance < -0.01
              ? "You owe money"
              : "You are all settled up"}
        </p>
      </div>

      {isAllSettledUp ? (
        <div className="text-center py-4">
          <p className="text-muted-foreground">Everyone is settled up!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* People who owe you */}
          {owedToYou.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center">
                  <ArrowUpCircle className="h-4 w-4 text-green-500 mr-2" />
                  Owed to you
                </h3>
                <div className="relative flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    className="flex items-center gap-1 rounded-full text-muted-foreground hover:bg-muted/60"
                    type="button"
                    onClick={() => setShowReminderMenu((prev) => !prev)}
                  >
                    <Bell className="h-3 w-3" />
                    <span>Remind</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>

                  {showReminderMenu && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-md border bg-white shadow-md z-10 text-xs">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted/60"
                        onClick={() => {
                          setShowReminderMenu(false);
                          handleReminderAllAction("now");
                        }}
                      >
                        Now
                      </button>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted/60"
                        onClick={() => {
                          setShowReminderMenu(false);
                          handleReminderAllAction("monthly");
                        }}
                      >
                        Every month (1st)
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {owedToYou
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.imageUrl} />
                          <AvatarFallback>
                            {member.name?.charAt(0) ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{member.name}</span>
                      </div>
                      <span className="font-medium text-green-600">
                        ₹{member.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* People you owe */}
          {youOwe.length > 0 && (
            <div>
              <h3 className="text-sm font-medium flex items-center mb-3">
                <ArrowDownCircle className="h-4 w-4 text-red-500 mr-2" />
                You owe
              </h3>
              <div className="space-y-3">
                {youOwe
                  .slice()
                  .sort((a, b) => a.total - b.total)
                  .map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.imageUrl} />
                        <AvatarFallback>
                          {member.name?.charAt(0) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{member.name}</span>
                    </div>
                    <span className="font-medium text-red-600">
                      ₹{Math.abs(member.total).toFixed(2)}
                    </span>
                  </div>
                  ))}
              </div>
            </div>
          )}

          {/* Global group balances: who owes whom between all members */}
          {pairwiseOwes.length > 0 && (
            <div className="pt-2 border-t">
              <h3 className="text-sm font-medium mb-3">Group balances (who owes whom)</h3>
              <div className="space-y-2 text-sm">
                {pairwiseOwes.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={s.from.imageUrl} />
                        <AvatarFallback>
                          {s.from.name?.charAt(0) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        {s.from.name || "Someone"} owes {s.to.name || "someone"}
                      </span>
                    </div>
                    <span className="font-medium">
                      ₹{s.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
