import { notFound } from "next/navigation";

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

  return <LobbyBattleClient lobbyId={params.id} />;
}
