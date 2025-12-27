"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function GroupMembers({ members }) {
  if (!members || members.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No members in this group
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((member) => {
        const id = member.id || member.userId;
        const isAdmin = member.role === "admin";
        const displayName = member.name || member.email || "Unknown";

        return (
          <div key={id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.imageUrl} />
                <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {displayName}
                  </span>
                  {isAdmin && (
                    <Badge variant="outline" className="text-xs py-0 h-5">
                      Admin
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
