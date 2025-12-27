"use client";

import { useParams, useRouter } from "next/navigation";
import { BarLoader } from "react-spinners";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import SettlementForm from "./components/settlement-form";

export default function SettlementPage() {
  const params = useParams();
  const router = useRouter();
  const { type, id } = params;

  const isUserSettlement = type === "user";

  const { data, isLoading, error } = useApiQuery(
    `/api/settlements/data?entityType=${encodeURIComponent(
      type
    )}&entityId=${encodeURIComponent(id)}`
  );

  const handleSuccess = () => {
    if (type === "user") {
      router.push(`/person/${id}`);
    } else if (type === "group") {
      router.push(`/groups/${id}`);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-lg">
      <Button
        variant="outline"
        size="sm"
        className="mb-4"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <div className="mb-6">
        <h1 className="text-5xl gradient-title">Record a settlement</h1>
        {type === "user" ? (
          <p className="text-muted-foreground mt-1">
            {data?.counterpart?.name
              ? `Settling up with ${data.counterpart.name}`
              : "Loading settlement details..."}
          </p>
        ) : (
          <p className="text-muted-foreground mt-1">
            {data?.group?.name
              ? `Settling up in group ${data.group.name}`
              : "Loading group details..."}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {type === "user" ? (
              <Avatar className="h-10 w-10">
                <AvatarImage src={data?.counterpart?.imageUrl} />
                <AvatarFallback>
                  {data?.counterpart?.name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="bg-primary/10 p-2 rounded-md">
                <Users className="h-6 w-6 text-primary" />
              </div>
            )}
            <CardTitle>
              {type === "user"
                ? data?.counterpart?.name || "Settlement"
                : data?.group?.name || "Group settlement"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-4">
              <BarLoader width="100%" color="#36d7b7" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">
              Failed to load settlement data: {String(error)}
            </p>
          ) : (
            <SettlementForm
              entityType={type === "group" ? "group" : "user"}
              entityData={data}
              onSuccess={handleSuccess}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
