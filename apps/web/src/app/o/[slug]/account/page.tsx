import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: PageProps<"/o/[slug]/account">) {
  const { slug } = await params;
  const { me } = await requireOrg(slug);

  return (
    <>
      <PageHeader title="Account" description={`Member since ${formatDate(me.createdAt)}.`} />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear to teammates across your workspaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm fullName={me.fullName ?? ""} email={me.email} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>We&apos;ll email you a secure link to choose a new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/forgot-password">Change password</Link>
            </Button>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
