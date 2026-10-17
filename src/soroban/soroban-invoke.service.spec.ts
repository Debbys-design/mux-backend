import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import {
  InvokeErrorCode,
  SOROBAN_INVOKE_ENABLED_ENV,
  SorobanNetwork,
} from './soroban-invoke.model';
import type { InvokeActor, InvokeRequest } from './soroban-invoke.model';
import {
  CONTRACT_REGISTRY,
  SOROBAN_RPC,
  SorobanInvokeService,
} from './soroban-invoke.service';
import type {
  ContractRegistryPort,
  SorobanRpcPort,
} from './soroban-invoke.service';

describe('SorobanInvokeService kill-switch', () => {
  const originalFlag = process.env[SOROBAN_INVOKE_ENABLED_ENV];

  let simulate: jest.Mock;
  let submit: jest.Mock;
  let rpc: SorobanRpcPort;
  let registry: ContractRegistryPort;
  let metrics: MetricsService;
  let service: SorobanInvokeService;

  const request: InvokeRequest = {
    contract: 'token',
    functionName: 'transfer',
    args: [],
    network: SorobanNetwork.TESTNET,
  };

  const actor: InvokeActor = {
    correlationId: 'test-correlation-id',
  } as InvokeActor;

  beforeEach(() => {
    simulate = jest.fn().mockResolvedValue({ success: true });
    submit = jest.fn().mockResolvedValue({ transactionHash: 'hash' });
    rpc = { simulate, submit } as unknown as SorobanRpcPort;
    registry = {
      resolveContractId: jest.fn().mockResolvedValue('C...'),
    } as unknown as ContractRegistryPort;
    metrics = {
      incrementCounter: jest.fn(),
    } as unknown as MetricsService;
    service = new SorobanInvokeService(rpc, registry, metrics);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[SOROBAN_INVOKE_ENABLED_ENV];
    } else {
      process.env[SOROBAN_INVOKE_ENABLED_ENV] = originalFlag;
    }
    jest.restoreAllMocks();
  });

  it('refuses with SOROBAN_INVOKE_DISABLED when the flag is unset', async () => {
    delete process.env[SOROBAN_INVOKE_ENABLED_ENV];

    await expect(service.invoke(request, actor)).rejects.toMatchObject({
      errorCode: InvokeErrorCode.FEATURE_FLAG_DISABLED,
    });
  });

  it.each(['false', '0'])('refuses with SOROBAN_INVOKE_DISABLED when the flag is %s', async (value) => {
    process.env[SOROBAN_INVOKE_ENABLED_ENV] = value;

    await expect(service.invoke(request, actor)).rejects.toMatchObject({
      errorCode: InvokeErrorCode.FEATURE_FLAG_DISABLED,
    });
  });

  it('makes zero simulate() and submit() calls when disabled', async () => {
    delete process.env[SOROBAN_INVOKE_ENABLED_ENV];

    await expect(service.invoke(request, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(simulate).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('allows the request to reach simulate() when the flag is true', async () => {
    process.env[SOROBAN_INVOKE_ENABLED_ENV] = 'true';

    await service.invoke(request, actor);

    expect(simulate).toHaveBeenCalledTimes(1);
  });
});
