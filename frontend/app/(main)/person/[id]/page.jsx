"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BarLoader } from "react-spinners";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PlusCircle,
  ArrowLeftRight,
  ArrowLeft,
  MessageCircle,
  Bell,
  ChevronDown,
} from "lucide-react";
import { ExpenseList } from "@/components/expense-list";
import { SettlementList } from "@/components/settlement-list";
import { useApiQuery } from "@/hooks/use-api-query";
import { ContactChat } from "@/components/contact-chat";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export default function PersonExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("expenses");
  const [showRemindMenu, setShowRemindMenu] = useState(false);
  const otherUserId = params.id;
  const { isSignedIn, user } = useUser();

  const { data, isLoading, error } = useApiQuery(
    `/api/settlements/between-user?otherUserId=${encodeURIComponent(
      otherUserId
    )}`
  );

  const { data: currentUser } = useApiQuery("/api/users/me");
  const { data: chatData } = useApiQuery(
    `/api/contacts/chat?otherUserId=${encodeURIComponent(otherUserId)}`
  );

  const otherUser = data?.otherUser;
  const expenses = data?.expenses || [];
  const settlements = data?.settlements || [];
  const balance = data?.balance || 0;
  const currentUserId = currentUser?._id;
  const messages = chatData?.messages || [];

  const handleDeleteContact = async () => {
    if (!otherUserId) return;
    if (!window.confirm("Are you sure you want to remove this contact from your list?")) {
      return;
    }

    try {
      const headers = user?.primaryEmailAddress?.emailAddress
        ? {
            "x-user-email": user.primaryEmailAddress.emailAddress || "",
            "x-user-name": user.fullName || "",
            "x-user-image": user.imageUrl || "",
          }
        : {};

      await apiClient.delete(`/api/contacts/${otherUserId}`, { headers });
      toast.success("Contact removed from your list");
      router.push("/contacts");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to remove contact");
    }
  };

  const handleRemindNow = async () => {
    try {
      if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
        toast.error("You must be signed in to send reminders");
        return;
      }

      const amount = Math.abs(balance);
      const headers = {
        "x-user-email": user.primaryEmailAddress.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      await apiClient.post(
        "/api/settlements/remind-user",
        {
          otherUserId,
          amount,
        },
        { headers }
      );

      toast.success(`Reminder sent to ${otherUser?.name || "contact"}`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to send reminder");
    } finally {
      setShowRemindMenu(false);
    }
  };

  const handleSaveSchedule = async (frequency) => {
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
          scopeType: "contact",
          scopeId: otherUserId,
          frequency,
        },
        { headers }
      );

      toast.success(
        frequency === "weekly"
          ? `Weekly Sunday reminders saved for ${otherUser?.name || "this contact"}`
          : `Monthly reminders (1st of month) saved for ${otherUser?.name || "this contact"}`
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save reminder preference");
    } finally {
      setShowRemindMenu(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {isLoading && (
        <div className="mb-4">
          <BarLoader width={"100%"} color="#36d7b7" />
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-500">
          Failed to load person data: {String(error)}
        </p>
      )}
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          className="mb-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              <AvatarImage src={otherUser?.imageUrl} />
              <AvatarFallback>
                {otherUser?.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-4xl gradient-title">{otherUser?.name}</h1>
              <p className="text-muted-foreground">{otherUser?.email}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {balance === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteContact}
              >
                Delete contact
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/settlements/user/${params.id}`}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Settle up
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/expenses/new`}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add expense
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                {balance === 0 ? (
                  <p>You are all settled up</p>
                ) : balance > 0 ? (
                  <p>
                    <span className="font-medium">{otherUser?.name}</span> owes
                    you
                  </p>
                ) : (
                  <p>
                    You owe <span className="font-medium">{otherUser?.name}</span>
                  </p>
                )}
              </div>
              {balance > 0 && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="xs"
                    type="button"
                    className="flex items-center gap-1 rounded-full text-muted-foreground hover:bg-muted/60"
                    onClick={() => setShowRemindMenu((prev) => !prev)}
                  >
                    <Bell className="h-3 w-3" />
                    <span>Remind</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  {showRemindMenu && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-md border bg-white shadow-md z-10 text-xs">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted/60"
                        onClick={handleRemindNow}
                      >
                        Now
                      </button>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted/60"
                        onClick={() => handleSaveSchedule("monthly")}
                      >
                        Every month
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div
              className={`text-2xl font-bold ${balance > 0 ? "text-green-600" : balance < 0 ? "text-red-600" : ""}`}
            >
              ₹{Math.abs(balance).toFixed(2)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for expenses and settlements */}
      <Tabs
        defaultValue="expenses"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="expenses">
            Expenses ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="settlements">
            Settlements ({settlements.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <ExpenseList
            expenses={expenses}
            showOtherPerson={false}
            otherPersonId={params.id}
            otherPersonName={otherUser?.name}
            userLookupMap={{
              ...(otherUser && otherUser._id
                ? { [otherUser._id]: otherUser }
                : {}),
              ...(currentUser && currentUser._id
                ? { [currentUser._id]: currentUser }
                : {}),
            }}
            currentUserId={currentUserId}
          />
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <SettlementList
            settlements={settlements}
            otherPersonId={otherUser?.id}
            otherPersonName={otherUser?.name}
            userLookupMap={{
              ...(otherUser && otherUser.id ? { [otherUser.id]: otherUser } : {}),
              ...(currentUser && currentUser._id ? { [currentUser._id]: currentUser } : {}),
            }}
          />
        </TabsContent>
      </Tabs>

      {/* One-to-one chat with this contact */}
      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Chat</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Keep a shared note or conversation with this person.
            </p>
          </CardHeader>
          <CardContent>
            <ContactChat otherUserId={otherUserId} initialMessages={messages} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
