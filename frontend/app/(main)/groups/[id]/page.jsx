"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { BarLoader } from "react-spinners";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, ArrowLeftRight, ArrowLeft, Users, Trash2, MessageCircle } from "lucide-react";
import { ExpenseList } from "@/components/expense-list";
import { SettlementList } from "@/components/settlement-list";
import { GroupBalances } from "@/components/group-balances";
import { GroupMembers } from "@/components/group-members";
import { GroupComments } from "@/components/group-comments";
import { useApiQuery } from "@/hooks/use-api-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export default function GroupExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const [activeTab, setActiveTab] = useState("expenses");
  const groupId = params.id;

  const { data, isLoading } = useApiQuery(`/api/groups/${groupId}/summary`);
  const { data: currentUser } = useApiQuery("/api/users/me");

  const handleDeleteGroup = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this group? This will remove all its expenses and settlements."
      )
    ) {
      return;
    }

    try {
      if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
        toast.error("You must be signed in to delete a group");
        return;
      }

      const headers = {
        "x-user-email": user.primaryEmailAddress.emailAddress || "",
        "x-user-name": user.fullName || "",
        "x-user-image": user.imageUrl || "",
      };

      await apiClient.delete(`/api/groups/${groupId}`, { headers });

      toast.success("Group deleted successfully");
      router.push("/contacts");
    } catch (error) {
      toast.error(error?.message || "Failed to delete group");
    }
  };

  if (isLoading || !data) {
    return (
      <div className="container mx-auto py-12">
        <BarLoader width={"100%"} color="#36d7b7" />
      </div>
    );
  }

  const group = data?.group;
  const members = data?.members || [];
  const expenses = data?.expenses || [];
  const settlements = data?.settlements || [];
  const balances = data?.balances || [];
  const userLookupMap = data?.userLookupMap || {};
  const comments = data?.comments || [];
  const currentUserId = currentUser?._id;

  return (
    <div className="container mx-auto py-6 max-w-4xl">
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
            <div className="bg-primary/10 p-4 rounded-md">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl gradient-title">{group?.name}</h1>
              <p className="text-muted-foreground">{group?.description}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {members.length} members
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleDeleteGroup}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete group
            </Button>
            <Button asChild variant="outline">
              <Link href={`/settlements/group/${params.id}`}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Settle up
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/expenses/new?groupId=${groupId}`}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add expense
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Grid layout for group details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Group Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupBalances
                balances={balances}
                members={members}
                expenses={expenses}
                settlements={settlements}
                groupId={group?.id}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Members</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupMembers members={members} />
            </CardContent>
          </Card>
        </div>
      </div>

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
            showOtherPerson={true}
            isGroupExpense={true}
            userLookupMap={userLookupMap}
            currentUserId={currentUserId}
          />
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <SettlementList
            settlements={settlements}
            isGroupSettlement={true}
            userLookupMap={userLookupMap}
          />
        </TabsContent>
      </Tabs>

      {/* Group conversation / comment section */}
      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Chat</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Share notes, plans and updates with everyone in this group.
            </p>
          </CardHeader>
          <CardContent>
            <GroupComments
              groupId={groupId}
              initialComments={comments}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
