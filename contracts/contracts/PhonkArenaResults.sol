// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PhonkArenaResults {
    event MatchStarted(bytes32 indexed matchId, uint256 startTime);
    event MatchFinalized(bytes32 indexed matchId, uint8 winner, uint256 endTime);

    mapping(bytes32 => bool) public started;
    mapping(bytes32 => bool) public finalized;
    mapping(bytes32 => uint256) public startTimes;

    uint256 public immutable minDuration;

    constructor(uint256 _minDuration) {
        minDuration = _minDuration;
    }

    function startMatch(bytes32 matchId) external {
        require(matchId != bytes32(0), "matchId required");
        require(!started[matchId], "already started");

        started[matchId] = true;
        startTimes[matchId] = block.timestamp;

        emit MatchStarted(matchId, block.timestamp);
    }

    function finalizeMatch(bytes32 matchId, uint8 winner) external {
        require(started[matchId], "match not started");
        require(!finalized[matchId], "already finalized");
        require(winner <= 2, "invalid winner");

        if (minDuration > 0) {
            require(block.timestamp >= startTimes[matchId] + minDuration, "too early");
        }

        finalized[matchId] = true;

        emit MatchFinalized(matchId, winner, block.timestamp);
    }
}