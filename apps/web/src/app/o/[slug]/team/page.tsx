import type { Metadata } from "next";
import {
  assignableRoles,
  canManageMember,
  hasPermission,
  ROLE_LABELS,
  type Invitation,
  type Member,
} from "@groundline/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { InviteDialog } from "./invite-dialog";
import { InvitationActions, RemoveMemberButton, RoleSelect } from "./member-actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/o/[slug]/team">) {
  const { slug } = await params;
  const { me, org } = await requireOrg(slug);
  const canManage = hasPermission(org.role, "members:manage");

  const [members, invitations] = await Promise.all([
    api<Member[]>(`/orgs/${org.id}/members`),
    canManage ? api<Invitation[]>(`/orgs/${org.id}/invitations`) : Promise.resolve([]),
  ]);
  const roles = assignableRoles(org.role);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Team"
        description={`People with access to ${org.name}.`}
        actions={canManage ? <InviteDialog orgId={org.id} slug={org.slug} roles={roles} /> : undefined}
      />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "person" : "people"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isSelf = m.user.id === me.id;
                  const manageable = canManageMember(org.role, m.role);
                  const name = m.user.fullName ?? m.user.email;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {name} {isSelf && <span className="font-normal text-muted-foreground">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(m.joinedAt)}</TableCell>
                      <TableCell>
                        {manageable ? (
                          <RoleSelect orgId={org.id} slug={org.slug} memberId={m.id} role={m.role} roles={roles} />
                        ) : (
                          <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(manageable || isSelf) && (
                          <RemoveMemberButton
                            orgId={org.id}
                            slug={org.slug}
                            memberId={m.id}
                            name={name}
                            orgName={org.name}
                            isSelf={isSelf}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Pending invitations</CardTitle>
              <CardDescription>Invitations expire after 7 days. Resending creates a new link.</CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No pending invitations.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden md:table-cell">Invited by</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((inv) => {
                      const expired = new Date(inv.expiresAt).getTime() <= now;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{ROLE_LABELS[inv.role]}</Badge>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {inv.invitedBy?.fullName ?? inv.invitedBy?.email ?? "—"}
                          </TableCell>
                          <TableCell className={expired ? "text-destructive" : "text-muted-foreground"}>
                            {expired ? "Expired" : formatDate(inv.expiresAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {roles.includes(inv.role) && (
                              <InvitationActions
                                orgId={org.id}
                                slug={org.slug}
                                invitationId={inv.id}
                                email={inv.email}
                                role={inv.role}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}
