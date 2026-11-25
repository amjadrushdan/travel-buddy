import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getTrip } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/format";
import { leaveTrip } from "./actions";
import { RemoveMemberButton } from "./RemoveMemberButton";
import { InvitePanel, type Invite } from "./InvitePanel";

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trip, members, me, userId } = await getTrip(id);
  const isOwner = me.role === "owner";
  const canInvite = me.role === "owner" || me.role === "editor";

  let invites: Invite[] = [];
  if (canInvite) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("list_invites", { p_trip_id: trip.id });
    invites = (data as Invite[] | null) ?? [];
  }

  return (
    <main className="flex flex-col gap-5 px-5 pt-[calc(16px+env(safe-area-inset-top))] lg:pt-0">
      <Link href={`/trips/${trip.id}`} className="self-start py-1 text-[15px] font-semibold lg:hidden">
        ‹ {trip.name}
      </Link>

      <div className="flex flex-col gap-1">
        <span className="label">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
        <h1 className="page-title">Members</h1>
      </div>

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {members.map((m, i) => {
          const isMe = m.user_id === userId;
          const canRemove = isOwner && !isMe && m.role !== "owner";
          return (
            <li key={m.user_id} className={`flex items-center gap-3 px-3.5 py-[11px] ${i > 0 ? "border-t border-line" : ""}`}>
              <Avatar name={m.profiles?.name ?? null} />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {m.profiles?.name ?? "Unknown"} {isMe && <span className="text-[13px] text-muted">(you)</span>}
              </span>
              <span className="rounded-sm border border-line px-[7px] py-[3px] font-mono text-[11px] text-muted">
                {roleLabel(m.role)}
              </span>
              {canRemove && <RemoveMemberButton tripId={trip.id} userId={m.user_id} name={m.profiles?.name ?? "member"} />}
            </li>
          );
        })}
      </ul>

      {canInvite ? (
        <InvitePanel tripId={trip.id} invites={invites} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <span className="label">Invite links</span>
          <span className="text-sm text-muted">Ask the owner or an editor for an invite link.</span>
        </div>
      )}

      <p className="text-center text-xs text-pretty text-muted">
        No accounts: this phone remembers you. If you clear this site&apos;s data or switch phones, open an invite link
        again to rejoin.
      </p>

      {!isOwner && (
        <form action={leaveTrip.bind(null, trip.id)} className="self-center">
          <button className="text-sm font-semibold text-bad underline">Leave trip</button>
        </form>
      )}
    </main>
  );
}
