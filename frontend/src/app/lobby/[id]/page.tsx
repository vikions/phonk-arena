import { LobbyBattleClient } from "@/components/LobbyBattleClient";

interface LobbyPageProps {
  params: {
    id: string;
  };
}

export default function LobbyPage({ params }: LobbyPageProps) {
  return <LobbyBattleClient lobbyId={params.id} />;
}