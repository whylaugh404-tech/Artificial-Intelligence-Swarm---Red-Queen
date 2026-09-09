import { logger } from '../core/logger';
import { randomUUID } from 'crypto';

export enum LeaderState {
  FOLLOWER = 'FOLLOWER',
  CANDIDATE = 'CANDIDATE',
  LEADER = 'LEADER'
}

export class ElectionManager {
  private readonly component = 'election';
  private state: LeaderState = LeaderState.FOLLOWER;
  private currentTerm = 0;
  private votedFor: string | null = null;
  private votesReceived = 0;
  private lastHeartbeat = Date.now();
  private readonly electionTimeoutMs: number;

  constructor(
    private readonly localNodeId: string,
    private readonly getActivePeersCount: () => number,
    private readonly broadcastVoteRequest: (term: number) => void,
    private readonly broadcastHeartbeat: (term: number) => void
  ) {
    // Randomize timeout between 1500 and 3000ms to prevent split votes
    this.electionTimeoutMs = 1500 + Math.random() * 1500;
    this.startElectionTimer();
  }

  private startElectionTimer() {
    setInterval(() => {
      if (this.state === LeaderState.LEADER) {
        this.broadcastHeartbeat(this.currentTerm);
      } else {
        const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
        if (timeSinceHeartbeat > this.electionTimeoutMs) {
          this.startElection();
        }
      }
    }, 500);
  }

  private startElection() {
    this.state = LeaderState.CANDIDATE;
    this.currentTerm++;
    this.votedFor = this.localNodeId;
    this.votesReceived = 1;
    this.lastHeartbeat = Date.now();
    logger.info(this.component, 'election_started', { term: this.currentTerm });

    const totalNodes = this.getActivePeersCount() + 1; // peers + self
    if (this.votesReceived > totalNodes / 2) {
      this.becomeLeader();
    } else {
      this.broadcastVoteRequest(this.currentTerm);
    }
  }

  handleHeartbeat(leaderId: string, term: number) {
    if (term >= this.currentTerm) {
      this.currentTerm = term;
      this.state = LeaderState.FOLLOWER;
      this.lastHeartbeat = Date.now();
      this.votedFor = null;
    }
  }

  handleVoteRequest(candidateId: string, term: number): boolean {
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.state = LeaderState.FOLLOWER;
      this.votedFor = candidateId;
      this.lastHeartbeat = Date.now();
      return true;
    }
    
    if (term === this.currentTerm && (this.votedFor === null || this.votedFor === candidateId)) {
      this.votedFor = candidateId;
      this.lastHeartbeat = Date.now();
      return true;
    }
    
    return false;
  }

  receiveVote(term: number) {
    if (this.state === LeaderState.CANDIDATE && term === this.currentTerm) {
      this.votesReceived++;
      const totalNodes = this.getActivePeersCount() + 1;
      if (this.votesReceived > totalNodes / 2) {
        this.becomeLeader();
      }
    }
  }

  private becomeLeader() {
    this.state = LeaderState.LEADER;
    logger.info(this.component, 'became_leader', { term: this.currentTerm });
    this.broadcastHeartbeat(this.currentTerm);
  }
}
