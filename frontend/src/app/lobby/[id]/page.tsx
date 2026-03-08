import { notFound } from "next/navigation";

import { ArenaBattleClient } from "@/components/ArenaBattleClient";
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

  return <ArenaBattleClient />;
}
