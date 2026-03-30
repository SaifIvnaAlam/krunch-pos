import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtService } from '@nestjs/jwt';

interface SyncEnvelope {
  event: 'OPERATION' | 'STATE_REQUEST' | 'STATE_RESPONSE' | 'CONFLICT';
  branchId: string;
  terminalId: string;
  vectorClock: Record<string, number>;
  payload: unknown;
  timestamp: number;
  idempotencyKey: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/sync',
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SyncGateway.name);
  private readonly terminalSockets = new Map<string, string>();

  constructor(
    private readonly syncService: SyncService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.['token'] as string | undefined
        ?? client.handshake.headers?.['authorization']?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn(`Connection rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        staffId: string;
        branchId: string;
        terminalId: string;
      };

      (client as Socket & { data: Record<string, unknown> }).data = {
        staffId: payload.staffId,
        branchId: payload.branchId,
        terminalId: payload.terminalId,
      };

      await client.join(`branch:${payload.branchId}`);
      this.terminalSockets.set(payload.terminalId, client.id);

      this.logger.log(`Terminal ${payload.terminalId} connected (branch: ${payload.branchId})`);
    } catch (error) {
      this.logger.warn(`Connection rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const data = (client as Socket & { data?: Record<string, unknown> }).data;
    if (data?.['terminalId']) {
      this.terminalSockets.delete(data['terminalId'] as string);
      this.logger.log(`Terminal ${data['terminalId']} disconnected`);
    }
  }

  @SubscribeMessage('OPERATION')
  async handleOperation(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: SyncEnvelope,
  ): Promise<void> {
    const data = (client as Socket & { data?: Record<string, unknown> }).data;
    const branchId = data?.['branchId'] as string;

    if (envelope.branchId !== branchId) {
      client.emit('ERROR', { message: 'Branch mismatch' });
      return;
    }

    const result = await this.syncService.processOperation({
      branchId: envelope.branchId,
      terminalId: envelope.terminalId,
      operation: envelope.event,
      payload: envelope.payload,
      vectorClock: envelope.vectorClock,
      idempotencyKey: envelope.idempotencyKey,
      timestamp: envelope.timestamp,
    });

    if (result.accepted) {
      client.to(`branch:${branchId}`).emit('OPERATION', {
        ...envelope,
        vectorClock: result.vectorClock,
      });
    }

    client.emit('ACK', {
      idempotencyKey: envelope.idempotencyKey,
      accepted: result.accepted,
      vectorClock: result.vectorClock,
    });
  }

  @SubscribeMessage('STATE_REQUEST')
  async handleStateRequest(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = (client as Socket & { data?: Record<string, unknown> }).data;
    const branchId = data?.['branchId'] as string;

    const state = await this.syncService.getBranchState(branchId);

    client.emit('STATE_RESPONSE', {
      event: 'STATE_RESPONSE',
      branchId,
      vectorClock: state.vectorClock,
      payload: {
        orders: state.orders,
        menuItems: state.menuItems,
      },
      timestamp: Date.now(),
      idempotencyKey: `state-${Date.now()}`,
    });
  }

  broadcastToBranch(branchId: string, event: string, data: unknown): void {
    this.server.to(`branch:${branchId}`).emit(event, data);
  }
}
