import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  InvokeErrorCode,
  InvokeStatus,
  SorobanNetwork,
} from './soroban-invoke.model';
import { SorobanInvokeService } from './soroban-invoke.service';
import { SorobanRpcPort } from './soroban-rpc.port';
import { ContractRegistryPort } from './contract-registry.port';

describe('SorobanInvokeService', () => {
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

  let service: SorobanInvokeService;
  let rpc: {
    simulate: jest.Mock;
    submit: jest.Mock;
  };
  let callOrder: string[];

  const baseRequest = {
    contract: 'wallet_registry',
    functionName: 'register',
    args: ['GADDRESS', 'metadata'],
    network: SorobanNetwork.TESTNET,
  };

  beforeEach(async () => {
    callOrder = [];

    rpc = {
      simulate: jest.fn(async () => {
        callOrder.push('simulate');
        return { success: true, estimatedCost: '100' };
      }),
      submit: jest.fn(async () => {
        callOrder.push('submit');
        return { transactionHash: 'abc123' };
      }),
    };

    const registry: ContractRegistryPort = {
      resolveContractId: jest.fn(async () => contractId),
    };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'SOROBAN_INVOKE_ENABLED') return 'true';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SorobanInvokeService,
        { provide: SorobanRpcPort, useValue: rpc },
        { provide: ContractRegistryPort, useValue: registry },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(SorobanInvokeService);
  });

  it('simulates before submitting a successful invoke', async () => {
    const result = await service.invoke(baseRequest);

    expect(result.status).toBe(InvokeStatus.SUBMITTED);
    expect(rpc.simulate).toHaveBeenCalledTimes(1);
    expect(rpc.submit).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['simulate', 'submit']);
  });

  it('returns FAILED with SOROBAN_SIMULATION_REVERTED and never submits on a simulated revert', async () => {
    rpc.simulate.mockImplementationOnce(async () => {
      callOrder.push('simulate');
      return { success: false, error: 'reverted' };
    });

    const result = await service.invoke(baseRequest);

    expect(result.status).toBe(InvokeStatus.FAILED);
    expect(result.errorCode).toBe(InvokeErrorCode.SIMULATION_REVERTED);
    expect(result.transactionHash).toBeUndefined();
    expect(rpc.submit).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['simulate']);
  });

  it('returns SIMULATED with no transactionHash and never submits when simulateOnly is true', async () => {
    const result = await service.invoke({ ...baseRequest, simulateOnly: true });

    expect(result.status).toBe(InvokeStatus.SIMULATED);
    expect(result.transactionHash).toBeUndefined();
    expect(rpc.simulate).toHaveBeenCalledTimes(1);
    expect(rpc.submit).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['simulate']);
  });
});
