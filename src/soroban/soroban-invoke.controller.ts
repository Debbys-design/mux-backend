import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { SorobanInvokeService } from './soroban-invoke.service';
import { SorobanNetwork } from './soroban-invoke.model';
import type {
  InvokeActor,
  InvokeRequest,
  InvokeResult,
} from './soroban-invoke.model';
import { InvokeSorobanDto } from './dto/invoke-soroban.dto';
import { resolveRequestId } from '../common/interceptors/request-id.interceptor';

/**
 * REST surface for Soroban contract invocation.
 *
 * Every route is behind `ApiKeyGuard` (deny-by-default). The client names an
 * allowlisted *contract*, never a contract id: ids are resolved server-side from
 * the contract registry, so a caller cannot point the orchestrator at an
 * arbitrary deployment.
 *
 * Responses carry versions, ids and the correlation id only — no key material,
 * no signed transaction, no seeds.
 */
@Controller('soroban')
export class SorobanInvokeController {
  constructor(private readonly soroban: SorobanInvokeService) {}

  /**
   * GET /v1/soroban/contracts?network=TESTNET
   *
   * The allowlisted contract functions usable on a network, so a client can
   * render a picker without guessing.
   */
  @Get('contracts')
  @UseGuards(ApiKeyGuard)
  listContracts(@Query('network') network?: string) {
    const resolved = this.resolveNetwork(network);
    return {
      network: resolved,
      functions: this.soroban.listAllowedFunctions(resolved),
    };
  }

  /**
   * Validates the `network` query parameter against `SorobanNetwork`.
   *
   * Absent parameter defaults to `TESTNET`. Any value that is not a member of
   * the enum is rejected with HTTP 400 and a stable `errorCode` so a client can
   * distinguish "no functions on this network" from "you typed the network
   * wrong".
   */
  private resolveNetwork(network: string | undefined): SorobanNetwork {
    if (network === undefined || network === null || network === '') {
      return SorobanNetwork.TESTNET;
    }
    const members = Object.values(SorobanNetwork) as string[];
    if (!members.includes(network)) {
      throw new BadRequestException({
        errorCode: 'SOROBAN_INVALID_NETWORK',
        message: `Invalid network '${network}'. Expected one of: ${members.join(', ')}.`,
      });
    }
    return network as SorobanNetwork;
  }

  /**
   * POST /v1/soroban/invoke
   *
   * Body: `{ contract, functionName, args, network, simulateOnly?, maxFee? }`.
   *
   * Every invoke is simulated before submission; set `simulateOnly: true` to
   * stop after simulation. Requires `SOROBAN_INVOKE_ENABLED=true`.
   */
  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  async invoke(
    @Body() body: InvokeSorobanDto,
    @Headers('x-request-id') correlationId?: string,
  ): Promise<InvokeResult> {
    return this.soroban.invoke(
      {
        contract: body?.contract,
        functionName: body?.functionName,
        args: body?.args,
        network: body?.network,
        simulateOnly: body?.simulateOnly,
        maxFee: body?.maxFee,
      },
      this.actor(correlationId),
    );
  }

  /**
   * Builds the actor from the validated request.
   *
   * `ApiKeyGuard` has already resolved the principal, so the role reflects what
   * the server determined — never what the client claimed in the body.
   */
  private actor(correlationId: string | undefined): InvokeActor {
    return {
      subjectId: 'api-key',
      role: 'api-key',
      correlationId: resolveRequestId(correlationId),
    };
  }
}
