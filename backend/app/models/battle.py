"""Battle model for PhonkArena."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


@dataclass
class BattleEntry:
    agent_id: str
    track_path: str = ""
    votes: int = 0


@dataclass
class Battle:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: float = field(default_factory=time.time)
    entries: list[BattleEntry] = field(default_factory=list)
    finalized: bool = False
    winner_id: str | None = None

    def vote(self, agent_id: str) -> None:
        if self.finalized:
            raise ValueError("Battle already finalized")
        for entry in self.entries:
            if entry.agent_id == agent_id:
                entry.votes += 1
                return
        raise ValueError(f"Agent {agent_id} not in this battle")

    def finalize(self) -> str:
        if self.finalized:
            raise ValueError("Battle already finalized")
        if not self.entries:
            raise ValueError("No entries in battle")
        winner = max(self.entries, key=lambda e: e.votes)
        self.winner_id = winner.agent_id
        self.finalized = True
        return self.winner_id

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "entries": [
                {"agent_id": e.agent_id, "track_path": e.track_path, "votes": e.votes}
                for e in self.entries
            ],
            "finalized": self.finalized,
            "winner_id": self.winner_id,
        }
