import { notFound } from "next/navigation";

import { EpochBattleSection } from "@/components/EpochBattleSection";
import { LobbyBattleClient } from "@/components/LobbyBattleClient";
import { isLobbyId } from "@/lib/lobbies";

interface LobbyPageProps {
  params: {
    id: string;
  };
}

export default function LobbyPage({ params }: LobbyPageProps) {
  if (!isLobbyId(params.id)) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <EpochBattleSection />
      <LobbyBattleClient lobbyId={params.id} />
    </div>
  );
}
